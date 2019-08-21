(function (global) {
'use strict';
const waveColor = 'black';

const canvas = document.getElementById('waveform');
const context2d = canvas.getContext('2d');
const container = document.getElementById('waveform-container');
const outerContainer = document.getElementById('waveform-outer-container');
let waveWidth = outerContainer.clientWidth;
canvas.width = waveWidth;
let waveOffset = 0;
let bufferLength = 0;
let instrument, sample;
let sampleIndex = 0, xScale = 0;
let selectionStart = 0, selectionEnd = 0;

window.addEventListener('resize', function (event) {
	const elementWidth = outerContainer.clientWidth;
	canvas.width = elementWidth;
	if (waveWidth < elementWidth) {
		waveWidth = elementWidth;
	}
	resizeWaveform();
});

outerContainer.addEventListener('scroll', function (event) {
	waveOffset = this.scrollLeft / waveWidth * bufferLength;
	redrawWaveform();
});

function resizeWaveform() {
	if (sample === undefined) {
		context2d.clearRect(0, 0, canvas.width, canvas.height);
		container.style.width = '';
		xScale = 0;
		waveOffset = 0;
	} else {
		container.style.width = waveWidth + 'px';
		xScale = bufferLength / waveWidth;
		waveOffset = outerContainer.scrollLeft / waveWidth * bufferLength;
		redrawWaveform();
	}
}

function redrawWaveform() {
	const endX = canvas.width - 1;
	if (sample.buffer.numberOfChannels === 1) {
		drawWave(0, endX, 113, 100, 105, 0);
	} else {
		drawWave(0, endX, 55, 50, 55, 0);
		drawWave(0, endX, 170, 50, 55, 1);
	}
}

function drawWave(startX, endX, centre, yScale, halfHeight, channelNumber) {
	const data = sample.buffer.getChannelData(channelNumber);
	const width = endX - startX + 1;
	const height = 2 * halfHeight + 1;
	context2d.clearRect(startX, centre - halfHeight, width, height);
	context2d.save();
	context2d.beginPath();
	context2d.rect(startX, centre - halfHeight, width, height);
	context2d.clip();
	context2d.beginPath();
	context2d.moveTo(0, centre);
	let incX = 1;
	if (xScale < 1) {
		incX = Math.trunc(1 / xScale);
	}
	for (let x = startX; x <= endX; x += incX) {
		const audioY = calculateY(data, x);
		const pixelY = centre - Math.round(audioY * yScale);
		context2d.lineTo(x, pixelY);
	}
	context2d.strokeStyle = waveColor;
	context2d.stroke();
	context2d.restore();
}

function calculateY(data, pixelX) {
	const gain = sample.gain;
	const waveMinX = Math.max((pixelX - 0.5) * xScale + waveOffset, 0);
	const waveMaxX = Math.min((pixelX + 0.5) * xScale + waveOffset, data.length - 1);
	const firstX = Math.trunc(waveMinX);
	const first = gain * data[firstX];
	const firstPortion = waveMinX - firstX;
	const lastX = Math.ceil(waveMaxX);
	const last = gain * data[lastX];
	const lastPortion = lastX - waveMaxX;
	let sum = first * firstPortion + last * lastPortion;
	let min = gain * data[firstX];
	let max = min;
	if (last < min) {
		min = last;
	} else if (last > max) {
		max = last;
	}
	let n = firstPortion + lastPortion;
	for (let x = firstX + 1; x <= lastX - 1; x++) {
		const value = gain * data[x];
		sum += value;
		if (value < min) {
			min = value;
		} else if (value > max) {
			max = value;
		}
		n++;
	}
	if ((min <= 0 && max <= 0) || (min >= 0 && max >= 0)) {
		if (max > first && max > last && (min === first || min === last)) {
			// local maximum
			return max;
		} else if (min < first && min < last && (max === first || max === last)) {
			// local minimum
			return min;
		} else {
			return sum / n;
		}
	} else if (sum < 0) {
		return min;
	} else {
		return max;
	}
}

function editSample(newInstrument, newSampleIndex) {
	instrument = newInstrument;
	sampleIndex = newSampleIndex;
	setSample(newInstrument.samples[newSampleIndex], true);
}

function setSample(newSample, resize) {
	sample = newSample;
	if (instrument !== undefined) {
		instrument.samples[sampleIndex] = newSample;
	}
	if (sample === undefined) {
		bufferLength = 0;
	} else {
		const newLength = sample.buffer.length;
		if (!resize && bufferLength > 0) {
			const ratio = newLength / bufferLength;
			waveWidth *= ratio;
			if (waveWidth < canvas.width) {
				waveWidth = canvas.width;
			}
		}
		bufferLength = newLength;
	}
	resizeWaveform();
}

function zoomIn() {
	const canvasWidth = canvas.width;
	waveWidth = (Math.trunc(waveWidth / canvasWidth) + 1) * canvasWidth;
	resizeWaveform();
}

function zoomOut() {
	const canvasWidth = canvas.width;
	let multiple = Math.trunc(waveWidth / canvasWidth) - 1;
	if (multiple < 1) {
		multiple = 1;
	}
	waveWidth = multiple * canvasWidth;
	container.style.width = waveWidth + 'px';
	xScale = bufferLength / waveWidth;
	outerContainer.scrollLeft = waveOffset / bufferLength * waveWidth;
	redrawWaveform();
}

function zoomShowAll() {
	waveWidth = canvas.width;
	resizeWaveform();
}

document.getElementById('btn-zoom-sample').addEventListener('click', zoomIn);
document.getElementById('btn-zoom-sample-out').addEventListener('click', zoomOut);
document.getElementById('btn-zoom-sample-all').addEventListener('click', zoomShowAll);

document.getElementById('btn-flip-sample').addEventListener('click', function(event) {
	if (sample !== undefined) {
		const numberOfChannels = sample.buffer.numberOfChannels;
		if (selectionStart === selectionEnd) {
			for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
				sample.polarityFlip(channelNumber);
			}
		} else {
			for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
				sample.polarityFlip(channelNumber, selectionStart, selectionEnd);
			}
		}
		redrawWaveform();
	}
});

document.getElementById('btn-reverse-sample').addEventListener('click', function(event) {
	if (sample !== undefined) {
		if (selectionStart === selectionEnd) {
			sample.reverse();
		} else {
			sample.reverse(selectionStart, selectionEnd);
		}
		redrawWaveform();
	}
});

document.getElementById('btn-ping-pong').addEventListener('click', function(event) {
	if (sample !== undefined) {
		setSample(sample.pingPong(), false);
	}
});

global.SampleEditor = {
	editSample: editSample,
};

})(window);

const audioContext = new AudioContext();
const instrument = new Synth.SampledInstrument('Instrument 1');
instrument.loadSampleFromURL(audioContext, 0, 'samples/acoustic-grand-piano.wav')
.then(function (resource) {
	SampleEditor.editSample(instrument, 0);
});
