'use strict';

const { createCanvas, createImageData, Image } = require('canvas');
const fs = require('fs');
const { RTCVideoSink, RTCVideoSource, i420ToRgba, rgbaToI420, RTCAudioSource } = require('wrtc').nonstandard;

const RTCAudioSourceSineWave = require('../../lib/server/webrtc/rtcaudiosourcesinewave');

const width = 640;
const height = 480;
const NUM_CIRCLES = 20;
const MIN_SIZE = 100;
const MAX_SIZE = 150;

// Returns a random int between two numbers.
function getRndInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
/**
   * An object 'class' to describe a circle which animates
   * its size (radius) and which can randomize its position.
   **/
  var Circle = {
    x: 0,
    y: 0,
    size: 0,
    _needsRandomized: false,

    /**
     * Set a random position and max size
     **/
    randomize: function() {
        this.x = getRndInt(50, width - 50);
        this.y = getRndInt(50, height - 50);
        this.maxSize = getRndInt(MIN_SIZE, MAX_SIZE);
    },

    /**
     * Animates the size up and down via a sine calculation against a passed-in
     * timestamp factorial.  (See the main program update() method).
     * Accepts an offset so different instances will animate out-of-sync
     * (if ofs was 0 for all instances, they would synchronize).
     * When the circle is fully-shrunk, it randomizes its position and max size.
     **/
    update: function(t, ofs) {
        this.size = Math.abs(Math.round(Math.sin(t + ofs) * this.maxSize));

        if (this.size < 2) {
            if (this._needsRandomized) {
                this.randomize();
                this._needsRandomized = false;
            }
        } else {
            this._needsRandomized = true;
        }
    },

    /**
     * Draws a circle to the context at the current position and size.
     * NOTE: this doesn't open or close a path, or apply a fill or stroke.
     * It assumes a path has already been opened in the context.
     * (See main program render() method)
     **/
    draw: function() {

    }
};

function beforeOffer(peerConnection) {
  const source = new RTCVideoSource();
  const track = source.createTrack();
  const transceiver = peerConnection.addTransceiver(track);
  const sink = new RTCVideoSink(transceiver.receiver.track);

  const sourceAudio = new RTCAudioSourceSineWave();
  // const sampleRate = 8000;
  // const numberOfFrames = sampleRate / 100;
  // const secondsPerSample = 1 / sampleRate;
  // const channelCount = 1;
  // const samples = new Int16Array(channelCount * numberOfFrames);
  // const twoPi = 2 * Math.PI;
  // const a = [1, 1];
  // const frequency = 440;
  // const maxValue = Math.pow(2, 16) / 2 - 1;
  // let time = 0;
  // for (let i = 0; i < numberOfFrames; i++, time += secondsPerSample) {
  //   for (let j = 0; j < channelCount; j++) {
  //     samples[i * channelCount + j] = a[j] * Math.sin(twoPi * frequency * time) * maxValue;
  //   }
  // }
  // var audioData = {
  //   samples,
  //   sampleRate,
  // };
  // sourceAudio.onData(audioData);
  const audioTrack = sourceAudio.createTrack();
  peerConnection.addTrack(audioTrack);
  let lastFrame = null;

  function onFrame({ frame }) {
    lastFrame = frame;
  }

  sink.addEventListener('frame', onFrame);

  // TODO(mroberts): Is pixelFormat really necessary?
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d', { pixelFormat: 'RGBA24' });
  context.fillStyle = 'white';
  context.fillRect(0, 0, width, height);

  // Create multiple Circle instances in an array.
  var circles = [];
  var t;
  for (var i = 0; i < NUM_CIRCLES; i++) {
      var circle = Object.create(Circle);
      circle.randomize();
      circles.push(circle);
  }

  function update() {
    t = 0.001 * Date.now();
    circles.forEach(function(circle, idx) {
        circle.update(t, idx);
    });
  }

  var imgXtra = new Image();
  imgXtra.src = fs.readFileSync(__dirname + '/xtra.jpg');

  const interval = setInterval(() => {
    if (lastFrame) {
      const lastFrameCanvas = createCanvas(lastFrame.width, lastFrame.height);
      const lastFrameContext = lastFrameCanvas.getContext('2d', { pixelFormat: 'RGBA24' });

      const rgba = new Uint8ClampedArray(lastFrame.width * lastFrame.height * 4);
      const rgbaFrame = createImageData(rgba, lastFrame.width, lastFrame.height);
      i420ToRgba(lastFrame, rgbaFrame);

      lastFrameContext.putImageData(rgbaFrame, 0, 0);
      context.drawImage(imgXtra, 0, 0);

      update();

      context.save();
      context.beginPath();
      // Draw each Circle instance, at its current position
      // and size, into the open path.
      // (Note that nothing gets visibly 'drawn' here - we're
      // just defining the shape of the path.)
      circles.forEach(function(circle) {
        context.moveTo(circle.x, circle.y);
        context.arc(circle.x, circle.y, circle.size, 0, 2 * Math.PI);
      });

      // Close the path and flag it as a clipping region
      // for any subsequent drawing.
      context.closePath();
      context.clip();

      // Draw the 'I Am The Night' image, which will be clipped
      // by our path, so it is drawn 'into' the circles.
      context.drawImage(lastFrameCanvas, 0, 0);
      // Restore the pre-clip state, so that no further
      // clipping will occur.  Otherwise, the Sexualizer bg
      // would get clipped when we draw it next frame.
      context.restore();
    } else {
      context.fillStyle = 'rgba(255, 255, 255, 0.025)';
      context.fillRect(0, 0, width, height);
    }
    const rgbaFrame = context.getImageData(0, 0, width, height);
    const i420Frame = {
      width,
      height,
      data: new Uint8ClampedArray(1.5 * width * height)
    };
    rgbaToI420(rgbaFrame, i420Frame);
    source.onFrame(i420Frame);
  });

  // NOTE(mroberts): This is a hack so that we can get a callback when the
  // RTCPeerConnection is closed. In the future, we can subscribe to
  // "connectionstatechange" events.
  const { close } = peerConnection;
  peerConnection.close = function() {
    clearInterval(interval);
    sink.stop();
    track.stop();
    return close.apply(this, arguments);
  };
}

module.exports = { beforeOffer };
