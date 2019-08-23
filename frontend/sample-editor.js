const audioContext = new AudioContext();

(function (global) {
'use strict';
const waveColor = 'gold';
const selectionBackground = 'hsl(45, 100%, 42%)';
const selectedWaveColor = '#222222';
const zoomMultiplier = 2;
const HEADER_HEIGHT = 24;

const canvas = document.getElementById('waveform');
const context2d = canvas.getContext('2d');
const overlay = document.getElementById('waveform-overlay');
const overlayContext = overlay.getContext('2d');
overlayContext.lineWidth = 2;
const container = document.getElementById('waveform-container');
const outerContainer = document.getElementById('waveform-outer-container');
let waveWidth = 0;
let zoomAmount = 1;
let waveOffset = 0;
let bufferLength = 0;
let instrument, sample;
let sampleIndex = 0, xScale = 0;
let selectionStart = 0, selectionEnd = 0;

const Drag = Synth.enumFromArray([
	'NONE',
	'LOOP_START',
	'LOOP_END',
	'RANGE',
]);

let dragging = Drag.NONE;

window.addEventListener('load', fitWidth);
window.addEventListener('resize', fitWidth);

function fitWidth(event) {
	const elementWidth = outerContainer.clientWidth;
	canvas.width = elementWidth;
	overlay.width = elementWidth;
	if (waveWidth < elementWidth) {
		waveWidth = elementWidth;
	}
	resizeWaveform();
}

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

function redrawWaveform(startX, endX) {
	if (startX === undefined) {
		startX = 0;
		endX = canvas.width - 1;
	}
	if (sample.buffer.numberOfChannels === 1) {
		drawWave(startX, endX, 130, 130, 130, 0);
	} else {
		drawWave(startX, endX, 62, 62, 62, 0);
		drawWave(startX, endX, 197, 62, 62, 1);
	}
	drawOverlay();
}

function drawWave(startX, endX, centre, yScale, halfHeight, channelNumber) {
	const data = sample.buffer.getChannelData(channelNumber);
	const width = endX - startX + 1;
	const height = 2 * halfHeight + 1;
	const top = centre - halfHeight;
	context2d.clearRect(startX, top, width, height);
	context2d.save();
	context2d.beginPath();
	context2d.rect(startX, top, width, height);
	context2d.clip();

	//Draw guide lines
	context2d.beginPath();
	context2d.lineWidth = 3;
	context2d.lineCap = 'round';
	context2d.setLineDash([1, 6]);
	context2d.moveTo(startX, centre);
	context2d.lineTo(endX, centre);
	context2d.strokeStyle = 'DarkSlateBlue';
	context2d.stroke();

	const range = getRange()
	const selectionStartX = calculateX(range[0]);
	const selectionEndX = calculateX(range[1]);
	if (selectionStart !== selectionEnd) {
		context2d.fillStyle = selectionBackground;
		context2d.fillRect(selectionStartX, top, selectionEndX - selectionStartX, height);
	}

	// Draw waveform
	context2d.beginPath();
	context2d.lineWidth = 1;
	context2d.setLineDash([]);
	context2d.moveTo(0, centre);
	let incX = 1;
	if (xScale < 1) {
		incX = Math.trunc(1 / xScale);
	}
	let x = startX;

	if (x < selectionStartX) {
		while (x <= endX && x <= selectionStartX) {
			const audioY = calculateY(data, x);
			const pixelY = centre - Math.round(audioY * yScale);
			context2d.lineTo(x, pixelY);
			x += incX;
		}
		context2d.strokeStyle = waveColor;
		context2d.stroke();
	}

	if (x <= endX && x < selectionEndX) {
		x -= incX;
		context2d.beginPath();
		while (x <= endX && x <= selectionEndX) {
			const audioY = calculateY(data, x);
			const pixelY = centre - Math.round(audioY * yScale);
			context2d.lineTo(x, pixelY);
			x += incX;
		}
		context2d.strokeStyle = selectedWaveColor;
		context2d.stroke();
		x -= incX
		context2d.beginPath();
	}

	if (x < endX) {
		while (x <= endX) {
			const audioY = calculateY(data, x);
			const pixelY = centre - Math.round(audioY * yScale);
			context2d.lineTo(x, pixelY);
			x += incX;
		}
		context2d.strokeStyle = waveColor;
		context2d.stroke();
	}

	context2d.restore();
}

function drawOverlay() {
	overlayContext.clearRect(0, 0, overlay.width, overlay.height);
	const maxOffset = Math.ceil(waveOffset + canvas.width * xScale);
	const height = overlay.height;

	const loopStart = sample.loopStart;
	if (loopStart >= waveOffset && loopStart < maxOffset) {
		const loopStartX = calculateX(loopStart);
		overlayContext.beginPath();
		overlayContext.moveTo(loopStartX, height);
		overlayContext.lineTo(loopStartX, 8);
		overlayContext.lineTo(loopStartX + 8, 16);
		overlayContext.lineTo(loopStartX, HEADER_HEIGHT);
		overlayContext.strokeStyle = 'LimeGreen';
		overlayContext.fillStyle = 'LimeGreen';
		overlayContext.stroke();
		overlayContext.fill();
	}

	const loopEnd = Math.min(sample.loopEnd, bufferLength - 1);
	if (loopEnd >= waveOffset && loopEnd < maxOffset) {
		const loopEndX = calculateX(loopEnd);
		overlayContext.beginPath();
		overlayContext.moveTo(loopEndX, height);
		overlayContext.lineTo(loopEndX, 8);
		overlayContext.lineTo(loopEndX - 8, 16);
		overlayContext.lineTo(loopEndX, HEADER_HEIGHT);
		overlayContext.strokeStyle = 'LimeGreen';
		overlayContext.fillStyle = 'LimeGreen';
		overlayContext.stroke();
		overlayContext.fill();
	}

	if (selectionStart === selectionEnd && selectionStart >= waveOffset && selectionStart < maxOffset) {
		overlayContext.beginPath();
		const selectionX = calculateX(selectionStart);
		overlayContext.moveTo(selectionX, HEADER_HEIGHT);
		overlayContext.lineTo(selectionX, height);
		overlayContext.strokeStyle = '#ffffdd';
		overlayContext.stroke();
	}
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

function calculateOffset(pixelX) {
	return Math.round(waveOffset + pixelX * xScale);
}

function calculateX(offset) {
	return Math.round((offset - waveOffset) / xScale);
}

function getRange() {
	if (selectionStart <= selectionEnd) {
		return [selectionStart, selectionEnd];
	} else {
		return [selectionEnd, selectionStart];
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
			waveWidth = Math.round(waveWidth * ratio);
			if (waveWidth < canvas.width) {
				waveWidth = canvas.width;
			}
			zoomAmount = waveWidth / canvas.width;
		}
		bufferLength = newLength;
	}
	resizeWaveform();
}

function zoomIn() {
	const maxOffset = Math.ceil(waveOffset + canvas.width * xScale);
	zoomAmount *= zoomMultiplier;
	waveWidth = Math.round(canvas.width * zoomAmount);
	container.style.width = waveWidth + 'px';
	xScale = bufferLength / waveWidth;
	const viewWidth = canvas.width * xScale;
	const range = getRange();
	if (selectionStart === selectionEnd && selectionStart >= waveOffset && selectionStart < maxOffset) {
		// centre the cursor
		waveOffset = selectionStart - viewWidth / 2;
	} else if (range[0] >= waveOffset && range[0] < maxOffset) {
		if (range[1] < maxOffset) {
			// centre the selection
			const zoomTo = (range[0] + range[1]) / 2;
			waveOffset = zoomTo - viewWidth / 2;
		} else {
			waveOffset += (maxOffset - waveOffset) / zoomMultiplier;
		}
	} else if (!(range[1] >= waveOffset && range[1] < maxOffset)) {
		// zoom and preserve the centre point
		waveOffset += viewWidth / 2;
	}
	if (waveOffset < 0) {
		waveOffset = 0;
	}
	outerContainer.scrollLeft = waveOffset / bufferLength * waveWidth;
	redrawWaveform();
}

function zoomOut() {
	zoomAmount /= zoomMultiplier;
	if (zoomAmount < 1) {
		zoomAmount = 1;
	}
	waveWidth = Math.round(canvas.width * zoomAmount);
	container.style.width = waveWidth + 'px';
	xScale = bufferLength / waveWidth;
	outerContainer.scrollLeft = waveOffset / bufferLength * waveWidth;
	redrawWaveform();
}

function zoomRange(from, to) {
	const viewWidth = to - from + 1;
	xScale = viewWidth / canvas.width;
	waveWidth = Math.round(bufferLength / xScale);
	container.style.width = waveWidth + 'px';
	zoomAmount = waveWidth / canvas.width;
	waveOffset = from;
	outerContainer.scrollLeft = waveOffset / bufferLength * waveWidth;
	redrawWaveform();
}

function zoomShowAll() {
	zoomAmount = 1;
	waveWidth = canvas.width;
	resizeWaveform();
}

overlay.addEventListener('mousedown', function (event) {
	if (sample === undefined) {
		return;
	}

	const x = event.offsetX;
	if (event.offsetY >= HEADER_HEIGHT) {
		const needDrawWave = selectionStart !== selectionEnd;
		selectionStart = calculateOffset(x);
		selectionEnd = selectionStart;
		if (needDrawWave) {
			redrawWaveform();
		}
		drawOverlay();
		dragging = Drag.RANGE;
		return;
	}

	const maxOffset = Math.ceil(waveOffset + canvas.width * xScale);
	const loopStart = sample.loopStart;
	let distanceToNearest = Number.MAX_VALUE;
	if (loopStart >= waveOffset && loopStart < maxOffset) {
		const loopStartX = calculateX(loopStart);
		const distance = Math.abs(x - loopStartX);
		if (distance <= 10) {
			dragging = Drag.LOOP_START;
			distanceToNearest = distance;
		}
	}
	const loopEnd = Math.min(sample.loopEnd, bufferLength - 1);
	if (loopEnd >= waveOffset && loopEnd < maxOffset) {
		const loopEndX = calculateX(loopEnd);
		const distance = Math.abs(x - loopEndX);
		if (distance <= 10 && distance < distanceToNearest) {
			dragging = Drag.LOOP_END;
			distanceToNearest = distance;
		}
	}
});

overlay.addEventListener('mousemove', function (event) {
	const x = event.offsetX;
	switch (dragging) {
	case Drag.RANGE:
		const offsetX = calculateOffset(x);
		selectionEnd = offsetX;
		redrawWaveform();
		break;

	case Drag.LOOP_START:
		const loopStart = calculateOffset(x);
		if (loopStart < sample.loopEnd) {
			sample.loopStart = loopStart;
			drawOverlay();
		}
		break;

	case Drag.LOOP_END:
		const loopEnd = calculateOffset(x);
		if (loopEnd > sample.loopStart) {
			sample.loopEnd = loopEnd;
			drawOverlay();
		}
		break;
	}
});

overlay.addEventListener('mouseup', function (event) {
	dragging = Drag.NONE;
});

overlay.addEventListener('mouseenter', function (event) {
	if (event.buttons !== 1 || event.offsetY >= HEADER_HEIGHT) {
		dragging = Drag.NONE;
	}
});

document.getElementById('sample-editor').addEventListener('keydown', function (event) {
	const incrementSize = Math.ceil(xScale * (event.repeat ? 6 : 1));
	const ctrl = event.ctrlKey ^ event.metaKey;

	switch (event.key) {
	case 'a':
		if (ctrl) {
			selectionStart = 0;
			selectionEnd = bufferLength - 1;
			zoomShowAll();
		}
		break;

	case 'ArrowLeft':
		if (selectionStart === selectionEnd && !event.shiftKey) {
			selectionStart -= incrementSize;
			if (selectionStart < 0) {
				selectionStart = 0;
			}
			selectionEnd = selectionStart;
			drawOverlay();
		} else {
			selectionEnd -= incrementSize;
			if (selectionEnd < 0) {
				selectionEnd = 0;
			} else if (Math.abs(selectionEnd - selectionStart) < xScale) {
				selectionEnd = selectionStart;
			}
			redrawWaveform();
		}
		break;

	case 'ArrowRight':
		if (selectionStart === selectionEnd && !event.shiftKey) {
			selectionStart += incrementSize;
			if (selectionStart >= bufferLength) {
				selectionStart = bufferLength - 1;
			}
			selectionEnd = selectionStart;
			drawOverlay();
		} else {
			selectionEnd += incrementSize;
			if (selectionEnd >= bufferLength) {
				selectionEnd = bufferLength - 1;
			} else if (Math.abs(selectionEnd - selectionStart) < xScale) {
				selectionEnd = selectionStart;
			}
			redrawWaveform();
		}
		break;

	case '=':
		if (event.altKey) {
			zoomIn();
		}
		break;

	case '-':
		if (event.altKey) {
			zoomOut();
		}
		break;

	case '0':
		if (event.altKey) {
			zoomShowAll();
		}
		break;
	}
});

document.getElementById('btn-zoom-sample').addEventListener('click', zoomIn);
document.getElementById('btn-zoom-sample-out').addEventListener('click', zoomOut);
document.getElementById('btn-zoom-sample-all').addEventListener('click', zoomShowAll);
document.getElementById('btn-zoom-sample-selection').addEventListener('click', function (event) {
	if (selectionStart !== selectionEnd) {
		zoomRange(selectionStart, selectionEnd);
	}
});

document.getElementById('btn-reverse-sample').addEventListener('click', function(event) {
	if (sample !== undefined) {
		sample.removeOffset();
		redrawWaveform();
	}
});

document.getElementById('btn-flip-sample').addEventListener('click', function(event) {
	if (sample !== undefined) {
		const numberOfChannels = sample.buffer.numberOfChannels;
		if (selectionStart === selectionEnd) {
			for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
				sample.polarityFlip(channelNumber);
			}
		} else {
			const range = getRange();
			for (let channelNumber = 0; channelNumber < numberOfChannels; channelNumber++) {
				sample.polarityFlip(channelNumber, range[0], range[1]);
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
			const range = getRange();
			sample.reverse(range[0], range[1]);
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

const instrument = new Synth.SampledInstrument('Instrument 1');
instrument.loadSampleFromURL(audioContext, 0, 'samples/acoustic-grand-piano.wav')
.then(function (resource) {
	SampleEditor.editSample(instrument, 0);
});
