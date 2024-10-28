var player;
var id_user;
$(document).ready(function () {

    let settings =  { 
        aspectRatio: '16:9' ,
        responsive:true,
        controls:true,
        preload:'auto',
    };

    (async () => {
        let playlistResponse = false;
        try {
            playlistResponse = await getPlaylistAsync(id_playlist);
        } catch (e) {
            alert(e);
        }

        if (!playlistResponse) {
            return;
        }

        const titleHero = playlistResponse.titleHero;
        const extractedObject = playlistResponse.extractedObject;

        const sortedIds = Object.keys(extractedObject).sort((a, b) => {
            const positionA = extractedObject[a].position || 0;
            const positionB = extractedObject[b].position || 0;
            return positionA - positionB;
        });

        console.log(sortedIds, "sortedIds");

        initializePlayer(extractedObject[sortedIds[0]].hlsLink, extractedObject[sortedIds[0]].subtitle, settings);

        for (const id of sortedIds) {
            const { title, thumbnailUrl, subtitle } = extractedObject[id];
            console.log(subtitle, "subsInfo from playlist"); // Log the subsInfo

            console.log(titleHero, "titleHero from playlist");

            $('.playlist-title').text(titleHero).append();

            $('.video-playlist-chapters').append(`<div class="chapter-item" data-id="${id}">
                <div class="thumbnail-container">
                    <img src="${thumbnailUrl}" class="thumbnail-image" />
                </div>
                <div class="title-container">${title}</div>
            </div>`);
        }

        $('.video-playlist-chapters .chapter-item').click(function (e) {
            const id = $(this).data('id');
            initializePlayer(extractedObject[id].hlsLink, extractedObject[id].subtitle);
        });
    })();

});

async function getHlsLinkAsync(id_video, id_user) {
    try{
        response = await $.ajax({
            url: `http://localhost:8001/hls-link`,
            data: { id_video: id_video, id_user: id_user },  
            type: "GET",
        });
        const hls_link = response.hls_link.hls;
        return hls_link;
    }catch(error){
        console.error(error);
    }
}
async function getTargetAsync(id_video, targetType) {
    try {
        response = await $.ajax({
            url: `http://localhost:8001/videoinfo`,
            data: { id_video: id_video },
            type: "GET",
        });
    
        if ('video_info' in response && 'targets' in response.video_info) {
            // Extract the target based on the specified targetType
            const targets = response.video_info.targets.filter(target => target['target-type'] === targetType);
            // const title = response.video_info.metadata.title;
            if (targetType === 'subtitle') {
                // Extract the asset storage URLs from all targets
                const targetDetails = targets.map(target => [
                    target['target-properties']['asset-storage-url'],
                    target['target-properties']['language-long-name']
                ]);
                return targetDetails;
            }
            else if(targetType === 'thumbnail') {
                return targets[0]['target-properties']['asset-storage-url'];
            }
             else {
                console.log(`${targetType} target not found in the targets array.`);
                return null; // or handle the absence of the target accordingly
            }
        } else {
            console.log('The "video_info.targets" property is missing in the response.');
            return null; // or handle the absence of 'video_info.targets' property accordingly
        }
    } catch (error) {
        console.error(error);
        return null; // or handle the error accordingly
    }
}


async function processAndAddSubtitles(subsUrl) {
    const subtitlePromises = (subsUrl && subsUrl.targetDetails ? subsUrl.targetDetails : subsUrl).map(async (subtitle, index) => {
        try {
            const srtText = await fetch(subtitle[0]).then(response => response.text());

            // Convert SRT to WebVTT format
            const vttRegex = /(.*\n)?(\d\d:\d\d:\d\d),(\d\d\d --> \d\d:\d\d:\d\d),(\d\d\d)/g;
            const vttText = 'WEBVTT\n\n' + srtText.replace(vttRegex, '$1$2.$3.$4');

            // Create a Blob from the WebVTT text
            const vttBlob = new Blob([vttText], { type: 'text/vtt' });
            const vttBlobURL = URL.createObjectURL(vttBlob);

            player.addRemoteTextTrack({
                kind: 'subtitles',
                src: vttBlobURL,
                srclang: subtitle[1].toLowerCase(),
                label: subtitle[1],
                default: index === 0,
            });
        } catch (error) {
            console.error(error);
        }
    });

    await Promise.all(subtitlePromises);
}



async function initializePlayer(hls_link, subsUrl,settings) {
    try {
        if (!player) {
            // Initialize Video.js player only if it doesn't exist
            player = videojs("video", settings, function () {
                this.qualitySelectorHls({
                    displayCurrentQuality: true,
                });

                this.autoCaption();
            });

            $('.video-playlist-player').append(player.el());
        }

        // Update player source
        player.src({
            src: hls_link,
            type: 'application/x-mpegURL'
        });

        player.textTracks().tracks_.forEach(track => {
            player.removeRemoteTextTrack(track);
        });

        await processAndAddSubtitles(subsUrl);
    } catch (error) {
        console.error(error);
    }
}



async function getPlaylistAsync(id_playlist) {
    try {
        response = await $.ajax({
            url: `http://localhost:8001/id-playlist`,
            data: { id_playlist: id_playlist }, 
            type: "GET",
        });

        const titleHero = response.id_playlist.metadata.title;    
        // Extract information from the response
        const contentsList = response.id_playlist.metadata["contents-list"];

        // Create an object to store the extracted information
        var extractedObject = {};

        await Promise.all(contentsList.map(async (content) => {
            const hlsLink = await getHlsLinkAsync(content.id, id_user);

            const thumbnailInfo = await getTargetAsync(content.id, 'thumbnail');

            const subsInfo = await getTargetAsync(content.id, 'subtitle');

            // Create content information object
            const contentInfo = {
                id: content.id,
                position: content.position,
                title: content.title,
                hlsLink: hlsLink,
                thumbnailUrl: thumbnailInfo,
                subtitle: subsInfo,
            };

            extractedObject[content.id] = contentInfo;
        }));

        console.log(extractedObject);
        return { titleHero, 
                extractedObject};
    } catch (error) {
        console.error(error);
    }
}
