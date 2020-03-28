const fs = require('fs'),
    xml2js = require('xml2js'),
    FfmpegCommand = require('fluent-ffmpeg'),
    prompt = require('prompt'),
    videoshow = require('videoshow'),
    cliProgress = require('cli-progress'),
    //sharp = require('sharp'),
    keptEvents = ["SharePresentationEvent", "GotoSlideEvent", "StartDeskshareEvent", "DeskShareStartRTMP", "DeskShareStopRTMP"],
    prompt_attributes = [
        {name: 'path', description: 'path to bongo download.'},
        {name: 'chat', description: "type yes to output chat as subtitle. (default:yes)", default: "yes"},
        {name: 'cache', description: "Overwrite cache if exist? (default:no)", default: "no"},
        {name: 'webcam', description: "Should webcam footage be included? (default:no)", default: "no"}
    ],
    myArgs = process.argv.slice(2);
if (myArgs.length === 0) {
    prompt.start();
    // Prompt and get user input then display those data in console.
    prompt.get(prompt_attributes, (err, result) => {
        if (err) return 1;
        else {
            let chat = result.chat.toLowerCase() === "yes",
                path = result.path.toString() === "" ? "C:\\Users\\seven\\Desktop" : result.path,
                cache = result.cache.toLowerCase() === "yes",
                webcam = result.webcam.toLowerCase() === "yes";
            main(chat, path, cache, webcam).then(() => console.log("exit"))
        }
    });
} else {
    let chat = true, path = "", cache = false, webcam, i = 0, required = false, invalid_ouput=false,output_path="";
    while (i < myArgs.length) {
        let it = myArgs[i];
        switch (it) {
            case '-p': {
                required = true;
                if(i+1>=myArgs.length) {
                    required = false;
                    break;
                }
                path = myArgs[i + 1].toString() === "" ? "C:\\Users\\seven\\Desktop" : myArgs[i + 1].toString();
                i++;
                break;
            }
            case '-nc': {
                chat = false;
                break;
            }
            case '-oc': {
                cache = true;
                break;
            }
            case '-w': {
                webcam = true;
                break;
            }
            case '-o': {
                if(i+1>=myArgs.length) {
                    invalid_ouput = true;
                    break;
                }
                output_path = myArgs[i + 1].toString() === "" ? "" : myArgs[i + 1].toString();
                if (!fs.existsSync(output_path)) fs.mkdirSync(output_path);
                i++;
                break;
            }
        }
        i++;
    }
    if (required) {
        if (invalid_ouput) console.log("invalid output directory");
        else if (fs.existsSync(path)) main(chat, path, cache, webcam,output_path).then(() => console.log("exit"));
        else console.log("invalid path!");
    } else {
        console.log("invalid arguments");
        console.log("please specify your path\n -p your_path\t option to specify path");
        console.log("-oc\toption to override your cache\n-w\tinclude webcam (default no)\n-nc\tdon't make chat subtitles");
    }
}

async function main(chat, path, cache, webcam,output) {

    let parser = new xml2js.Parser();

    if (!fs.existsSync(path + "/temp")) fs.mkdirSync(path + "/temp/");

    if (chat) keptEvents.push("PublicChatEvent");
    //conversie xml to json
    console.log("reading xml-data from: " + path + "/meetingFiles/events.xml");

    // vind de ndige bestanden
    let test = fs.readFileSync(path + '/spa-build/index.html', "utf8");
    let index = test.toString().indexOf("data-path=\"video\">../meetingFiles/");
    // hou enkel het relevante smijt de rest gewoon weg
    test = test.slice(index, index + 500);
    let webcamvideo = test.toString().match(/video">..\/meetingFiles\/(?<video>[.A-Z_0-9a-z]*)<\/script>/i).groups.video;
    let screenvideo = test.toString().match(/slave-video">..\/meetingFiles\/(?<video>[.A-Z_0-9a-z]*)<\/script>/i).groups.video;
    console.log(`Video's have been found:\n - ${webcamvideo}\n - ${screenvideo}`);
    // read events
    let json = (await parser.parseStringPromise(fs.readFileSync(path + '/meetingFiles/events.xml'))).recording;

    let name = json.meeting[0]['$'].name,
        events = json.event;

    //keep only relevent events for processing, let's save some memory
    events = events.filter(item => keptEvents.includes(item['$'].eventname));


    // alle nodige images verkrijgen + chat regelen
    let images = await handle_events(events, path, chat, name);

    console.log("Done reading xml \nPreparing image to video conversion");

    //maak van elke afbeelding een gepaste video dan mergen naar 1 groot bestand
    let videos = await make_video(images, path, cache, screenvideo);
    console.log("Merging all videos");
    await (new Promise((resolve, reject) => videos.reduce((result, input) => result.input(input), FfmpegCommand())
            .format('mp4')
            .on('end', resolve)
            .on('error', reject)
            .on('stderr', (stderrLine) => console.log('Stderr output: ' + stderrLine))
            .on('progress', (p) => console.log(p.timemark))
            .addOption('-preset ultrafast')
            .addOption('-threads 4')
            .mergeToFile(`${path}/temp/tempPresentation2.mp4`))
    );
    if(output !== ""){output =`${output}/${name}.mp4` }
    else {output = `${path}/${name}.mp4`}
    if (!webcam) {
        FfmpegCommand()
            .addOption('-c copy')
            .input(`${path}/temp/tempPresentation2.mp4`)
            .input(`${path}/meetingFiles/${webcamvideo}`)
            // enkel audio toevoegen
            .addOptions(['-map 0:v', '-map 1:a'])
            .save(output);
    } else {
        console.error("Not yet implemented, pls run again without webcam/overwriting cache")
    }
}

//Quick and dirty helpers function to get all unique eventsnames
function get_all_unique_event_names(events) {
    let unames = events.map(item => item['$'].eventname),
        unique = [];
    unames.forEach(item => {
        if (!unique.includes(item)) unique = unique.concat([item]);
    });
    console.log(unique);
}

function images_to_video(images, i, name) {
    let videoOptions = {
        transition: false,
        fps: 30
    };
    return new Promise((resolve, reject) => {
        videoshow([images], videoOptions)
            .option('-preset ultrafast')
            .complexFilter('scale=1920x1080,setdar=1:1')
            .save(name)
            .on('error', reject)
            .on('end', () => resolve(name))
    })
}

async function handle_events(events, path, chat, name) {
    let picture = "", images = [], chatmessages = [], chatCount = 1;
    const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar1.start(events.length, 0);
    for (let i = 0; i < events.length; i++) {
        let item = events[i];
        switch (item['$'].eventname) {
            case "SharePresentationEvent": {
                picture = path + "/meetingFiles/presentation/" + item.presentationName + "/";
                let image = picture + "slide-1.png";
                let time = find_next(events, i, ["GotoSlideEvent", "StartDeskshareEvent", "SharePresentationEvent"]) - item['$'].timestamp;
                // de min 1 is voor hoe stream_loop van ffpmeg werkt te corrigeren
                images.push({path: image, loop: 1, video_ignored: false, ignored_loop_param: time});
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
                let time = find_next(events, i, ["GotoSlideEvent", "StartDeskshareEvent", "SharePresentationEvent"]) - item['$'].timestamp;
                images.push({path: image, loop: 1, video_ignored: false, ignored_loop_param: time});
                break;
            }
            case "DeskShareStartRTMP": {
                let image = "./default.png";
                let time = find_next(events, i, ["StartDeskshareEvent"]) - item['$'].timestamp;
                images.push({path: image, loop: 1, video_ignored: false, ignored_loop_param: time});
                break;
            }
            case "StartDeskshareEvent": {
                let path = "./default.png";
                let time = find_next(events, i, ["DeskShareStopRTMP"]) - item['$'].timestamp;
                images.push({
                    path: path,
                    video_ignored: true,
                    ignored_loop_param: time,
                    start: item['$'].timestamp - events[0]['$'].timestamp
                });
                break;
            }
            case "PublicChatEvent": {
                if (chat) {
                    let message = item.message[0];
                    chatmessages.push(chatCount);
                    chatmessages.push(parse_to_srt_timestamp(item['$'].timestamp - events[0]['$'].timestamp));
                    chatmessages.push(`${message}\n`);
                    chatCount++;
                }
                break;
            }
        }
        bar1.update(i)
    }
    bar1.stop();
    if (chat) fs.writeFileSync(`${path}/${name}.srt`, chatmessages.join("\n"));
    return images;
}

function parse_to_srt_timestamp(time) {
    let milli = time % 1000;
    time = time / 1000;
    let min = Math.floor(time / 60) % 60, hour = Math.floor(time / 3600) % 3600, seconds = Math.floor(time % 60);
    return `${hour}:${min}:${seconds},${milli} --> ${hour}:${min}:${seconds + 3},${milli}`;
}

function video_ffmpeg_loop_promise(path, loop, i) {
    return new Promise(((resolve, reject) => {
        FfmpegCommand()
            .format('mp4')
            .on('error', (err) => reject(err.message))
            .on('end', resolve)
            .addOption('-threads 4')
            .addOption('-preset ultrafast')
            .input(`${path}/temp/tempp${i}.mp4`)
            .inputOptions([`-stream_loop ${Math.round(loop)}`])
            .save(`${path}/temp/finaltempp${i}.mp4`);
    }))
}

function make_video(images, path, cache, screen) {
    return new Promise(async (resolve, reject) => {
        let video = [], loopSum = 0;

        const bar2 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        bar2.start(images.length, 0);
        for (let i = 0; i < images.length; i++) {
            if (cache || !fs.existsSync(`${path}/temp/finaltempp${i}.mp4`)) {
                if (!images[i].video_ignored) {
                    let test, loop = (images[i].ignored_loop_param) / 1000;
                    if (loop < 1) {
                        test = {path: images[i].path, loop: loop};
                        await images_to_video(images[i], i, `${path}/temp/finaltempp${i}.mp4`);
                    } else {
                        test = images[i];
                        loop -= 1;
                        await images_to_video(images[i], i, `${path}/temp/tempp${i}.mp4`);
                        await video_ffmpeg_loop_promise(path, loop, i);
                    }
                } else {
                    let duration = (images[i].ignored_loop_param - 1000) / 1000, start = images[i].start / 1000;
                    let min = Math.floor(start / 60) % 60, hour = Math.floor(start / 3600) % 3600,
                        seconds = Math.floor(start % 60);
                    let tmin = Math.floor(duration / 60) % 60, thour = Math.floor(duration / 3600) % 3600,
                        tseconds = Math.floor(duration % 60);
                    await (new Promise(((resolve1, reject1) => FfmpegCommand()
                            .input(`${path}/meetingFiles/${screen}`)
                            .on('end', resolve1)
                            .on('error', (e) => reject1(e))
                            .complexFilter('scale=1920x1080,setdar=1:1')
                            .addOption(`-ss ${hour}:${min}:${seconds}`)
                            .addOption(`-t ${thour}:${tmin}:${tseconds}`)
                            .save(`${path}/temp/finaltempp${i}.mp4`)
                    )));
                }
            }
            video.push(`${path}/temp/finaltempp${i}.mp4`);
            bar2.update(i);
        }
        bar2.stop();
        resolve(video)
    });
}

function find_next(events, k, find) {
    for (let i = k + 1; i < events.length; i++) if (find.includes(events[i]['$'].eventname)) return events[i]['$'].timestamp;
    return events[events.length - 1]['$'].timestamp;
}
