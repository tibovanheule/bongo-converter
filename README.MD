# bongo to mp4 converter
## What is this?
Bongo is a great platform to perform virtual class room meetings but has one great flaw. The downloads are a stupid non-portable non-cross-platform html-page built by react in a stupid zip. This can be easily converted to a less enormous file using some node js and ffmpeg, so it is great to install this script on your server! 
## how to install?
1. install ffmpeg (see [ffmpeg.org](https://ffmpeg.org))
2. install node js.
2. run: npm install (first time only)
## how to convert a bongo zip download?
### Prompt
1. run command: `node index.js`
2. a prompt will ask for a path to a bongo folder
3. type yes to include chat
4. type yes to overwrite cache (if any)
5. type yes to include webcam footage
### command line arguments
run: `node index.js -p your_path`
- -p your_path: option to specify path to bongo folder REQUIRED
- -oc: overwrite cache (default no)
- -w: include webcam footage (default no)
- -nc: don't make chat subtitles

# donations
https://www.buymeacoffee.com/tibovanheule
