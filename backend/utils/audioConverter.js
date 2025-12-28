const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper to convert buffer to OGG/Opus
const convertToOgg = async (inputBuffer, originalName) => {
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `input_${Date.now()}_${originalName}`);
    const outputPath = path.join(tempDir, `output_${Date.now()}.ogg`);

    fs.writeFileSync(inputPath, inputBuffer);

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat('ogg')
            .audioCodec('libopus')
            .on('error', (err) => {
                // Try cleanup
                try { fs.unlinkSync(inputPath); } catch (e) { }
                try { fs.unlinkSync(outputPath); } catch (e) { }
                reject(err);
            })
            .on('end', () => {
                try {
                    const outputBuffer = fs.readFileSync(outputPath);
                    // Cleanup
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);
                    resolve(outputBuffer);
                } catch (e) {
                    reject(e);
                }
            })
            .save(outputPath);
    });
};

module.exports = { convertToOgg };
