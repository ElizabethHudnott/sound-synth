(function (global) {
'use strict';
const waveColor = 'black';

const canvas = document.getElementById('waveform');
const context2d = canvas.getContext('2d');
let zoom = 1;
let sample, xScale;

window.addEventListener('resize', resizeWaveform);

function resizeWaveform() {
	if (sample === undefined) {
		return;
	}
	canvas.width = canvas.parentElement.clientWidth * zoom;
	calculateScale();
	redrawWaveform();
}

function calculateScale() {
	xScale = sample.buffer.length / canvas.width;
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

function scaleAndRedraw() {
	calculateScale();
	redrawWaveform();
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
	for (let x = startX; x <= endX; x++) {
		const audioY = calculateY(data, x, xScale);
		const pixelY = centre - Math.round(audioY * yScale);
		context2d.lineTo(x, pixelY);
	}
	context2d.strokeStyle = waveColor;
	context2d.stroke();
	context2d.restore();
}

function calculateY(data, pixelX, scale) {
	const gain = sample.gain;
	const waveMinX = Math.max((pixelX - 0.5) * scale, 0);
	const waveMaxX = Math.min((pixelX + 0.5) * scale, data.length - 1);
	const lowerX = Math.trunc(waveMinX);
	const lowerPortion = waveMinX - lowerX;
	const upperX = Math.ceil(waveMaxX);
	const upperPortion = upperX - waveMaxX;
	let n = lowerPortion + upperPortion;
	let sum = gain * (data[lowerX] * lowerPortion + data[upperX] * upperPortion);
	let absSum = gain * (Math.abs(data[lowerX]) * lowerPortion + Math.abs(data[upperX]) * upperPortion);
	for (let x = lowerX + 1; x <= upperX - 1; x++) {
		const value = data[x] * gain;
		sum += value;
		absSum += Math.abs(value);
		n++;
	}
	return Math.sign(sum) * absSum / n;
}

function setSample(newSample) {
	const noPreviousSample = sample === undefined;
	sample = newSample;
	if (newSample === undefined) {
		canvas.width = 0;
	} else if (noPreviousSample) {
		resizeWaveform();
	} else {
		calculateScale();
		redrawWaveform();
	}
}

function setZoom(zoomFactor) {
	zoom = zoomFactor;
	resizeWaveform();
}

global.SampleEditor = {
	setSample: setSample,
	setZoom: setZoom,
	redraw: scaleAndRedraw,
};

})(window);

const audioContext = new AudioContext();
const instrument = new Synth.SampledInstrument('Instrument 1');
instrument.loadSampleFromURL(audioContext, 0, 'samples/acoustic-grand-piano.wav')
.then(function (resource) {
	SampleEditor.setSample(resource.data);
});
