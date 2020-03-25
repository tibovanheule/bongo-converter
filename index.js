const fs = require('fs'),
    xml2js = require('xml2js'),
    FfmpegCommand = require('fluent-ffmpeg'),
    prompt = require('prompt'),
    videoshow = require('videoshow'),
    //sharp = require('sharp'),
    keptEvents = ["SharePresentationEvent", "GotoSlideEvent", "StartDeskShareEvent"],
    prompt_attributes = [
        {
            name: 'path',
            description: 'path to bongo download.'
        },
        {
            name: 'chat',
            description: "type yes to include chat in conversion."
        }
    ];

prompt.start();

// Prompt and get user input then display those data in console.
prompt.get(prompt_attributes, (err, result) => {
    if (err) {
        console.log(err);
        return 1;
    } else {
        let parser = new xml2js.Parser(), chat = result.chat.toLowerCase() === "yes",
            path = "C:\\Users\\seven\\Desktop\\meetingFiles";

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
                    resize_images(events, path).then((images) => {
                        console.log("Done reading\nPreparing video conversion, this could take a while");
                        let videoOptions = {
                            transition: false,
                        };
                        //slicen op 50 tis anders te veel om te testen
                        videoshow(images.slice(0,5),videoOptions)
                            .save(`${path}/tempPresentation2.mp4`)
                            .on('start', (cli) => console.log(cli))
                            .on('error', console.log)
                            .on('progress', console.log)
                            .on('end', () => {
                                let command = ffmpeg_command();
                                command.addOption('-c copy');
                                command.input(`${path}/tempPresentation2.mp4`);
                                //command.input(``);
                                //onderstaand commando is voor later (chat)
                                //command.addOption(`-vf "movie=dbz120.mp4 [a]; movie=dbz121.mp4 [b]; [in][a] overlay=0:32 [c]; [c][b] overlay=0:448`);
                                command.addOption(`-vf "movie=${path}/__157180_6828003742b85dddddfb4e14279dc527.mp4 [a]; [in][a] overlay=0:32 [c]`);
                                command.save(`${path}/${name}.mp4`);
                            })


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
        .on('start', (c) => console.log('starting', c))
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

async function resize_images(events, path) {
    let res, picture = "", images = [];
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
                //find_next_slide(events,i)-item['$'].timestamp
                images.push({path: image, loop: 1})
            }
        }
    }
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
