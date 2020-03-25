const fs = require('fs'),
    xml2js = require('xml2js'),
    FfmpegCommand = require('fluent-ffmpeg'),
    prompt = require('prompt'),
    videoshow = require('videoshow'),
    //sharp = require('sharp'),
    keptEvents = ["SharePresentationEvent", "GotoSlideEvent", "StartDeskShareEvent"],
    prompt_attributes = [
        {name: 'path', description: 'path to bongo download.'},
        {name: 'chat', description: "type yes to include chat in conversion."},
        {name: 'cache', description: "Overwrite cache if exist?"}
    ];

prompt.start();

// Prompt and get user input then display those data in console.
prompt.get(prompt_attributes, (err, result) => {
    if (err) {
        console.log(err);
        return 1;
    } else {
        let parser = new xml2js.Parser(),
            chat = result.chat.toLowerCase() === "yes",
            path = "C:\\Users\\seven\\Desktop\\meetingFiles",
            cache = result.cache.toLowerCase() === "yes" | true;

        //conversie xml to json
        console.log("reading xml-data from:" + path + "/events.xml");
        fs.readFile(path + '/events.xml', (err, data) => {
            parser.parseString(data, (err, result) => {
                if (err) {
                    //die
                } else {
                    //json editing
                    let json = result.recording;
                    let name = json.meeting[0]['$'].name;
                    let events = json.event;
                    events = events.filter(item => keptEvents.includes(item['$'].eventname));
                    resize_images(events, path).then(async (images) => {
                        console.log("Done reading\nPreparing image to video conversion");

                        let video = [], loopSum = 0;

                        for (let i = 0; i < images.length; i++) {
                            if (cache || !fs.existsSync(`${path}/tempp${i}.mp4`)) {
                                let loop = images[i].loop, imag = [{path: images[i].path, loop: 1}];
                                loopSum += loop;
                                await images_to_viceo(imag, path, i);
                                let ffmpegCommand = ffmpeg_command().input(`${path}/tempp${i}.mp4`).inputOptions([`-stream_loop ${Math.abs(Math.round(loop))}`]);
                                await ffmpegCommand.save(`${path}/finaltempp${i}.mp4`);
                                video.push(`${path}/finaltempp${i}.mp4`);
                            }
                            console.log(i / images.length * 100)
                        }
                        console.log(loopSum);


                        let concat_video = video.reduce((result, input) => result.input(input), ffmpeg_command());
                        concat_video.addOptions(['-threads 2', '-c copy']);
                        await concat_video.mergeToFile(`${path}/tempPresentation2.mp4`);

                        /*let command = ffmpeg_command();
                        command.addOption('-c copy');
                        command.input(`${path}/tempPresentation2.mp4`).inputOption('-hwaccel auto');
                        command.addOption(`--vf "movie=${path}/__157180_6828003742b85dddddfb4e14279dc527.mp4 [a]; [in][a] overlay=0:32 [c]`);
                        command.save(`${path}/${name}.mp4`);

                         */


                        //let chainedInputs = inputlist.reduce((result, inputItem) => result.addInput(inputItem), ffmpeg_command());
                        //chainedInputs.mergeToFile(`${path}/tempPresentation.mp4`);

                        // new ffmpeg command voor mergen webcam, audio en presentatie

                    })


                }
            });
        });
    }
});


//new ffmpeg command
function ffmpeg_command() {
    return new FfmpegCommand()
        .format('mp4')
        .on('error', (err) => console.log('An error occurred: ' + err.message))
        .on('end', () => console.log(`Processing finished!`))
        .on('progress', (p) => console.log(p.timemark))
        .addOption('-preset ultrafast');
}

//Quick and dirty helpers function to get all unique eventsnames
function get_all_unique_event_names(events) {
    let unames = events.map(item => item.eventname),
        unique = [];
    unames.forEach(item => {
        if (!unique.includes(item)) unique = unique.concat([item]);
    });
    console.log(unique);
}

function images_to_viceo(images, path, i) {
    let videoOptions = {
        transition: false,
    };
    return new Promise((resolve, reject) => {
        videoshow(images, videoOptions)
            .option('-preset ultrafast')
            .option('-threads 2')
            .save(`${path}/tempp${i}.mp4`)
            .on('error', reject)
            .on('end', () => resolve(`${path}/tempp${i}.mp4`))
    })
}

async function resize_images(events, path) {
    let res, picture = "", images = [], first = events[0]['$'].timestamp, times = [];
    for (let i = 0; i < events.length; i++) {
        let item = events[i];

        switch (item['$'].eventname) {
            case "SharePresentationEvent": {
                picture = path + "/presentation/" + item.presentationName + "/";
                break;
            }
            case "GotoSlideEvent": {
                let image = picture + "slide-" + item.slide + ".png";
                /* resizing images               res = await fs.readFile(image, async (err, data) => {
                                    if (err) throw err;
                                    res = await sharp(data).resize(1600, 1200, {
                                        fit: 'fill',
                                    }).toFile(image, () => console.log("resized image: " + image));
                                });
                */

                let time = ((find_next_slide(events, i)) - (item['$'].timestamp)) / 1000;
                times.push(time);

                //find_next_slide(events,i)-item['$'].timestamp
                images.push({path: image, loop: time})
            }
        }
    }
    console.log(times);
    return images;
}

function find_next_slide(events, k) {
    for (let i = k + 1; i < events.length; i++) {
        let item = events[i];
        if (item['$'].eventname === "GotoSlideEvent") {
            return item['$'].timestamp;
        }
    }
    return events[k]['$'].timestamp + 240;

}
