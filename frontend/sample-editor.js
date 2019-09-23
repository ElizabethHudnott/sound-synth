const audioContext = new AudioContext({latencyHint: 0.06});

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
let sampleIndex = 0;
let sampleBufferNode;
let xScale = 0;	// Number of samples per pixel
let selectionStart = 0, selectionEnd = 0;
let clipboard;

const Drag = Synth.enumFromArray([
	'NONE',
	'LOOP',
	'LOOP_START',
	'LOOP_END',
	'RANGE',
]);

let dragging = Drag.NONE;

const sampleGain = audioContext.createGain();
sampleGain.connect(audioContext.destination);

function gate(gate, note) {
	if (gate === Synth.Gate.CLOSED) {
		sampleBufferNode.loop = false;
		return;
	}

	const now = audioContext.currentTime;
	const time = now + Synth.TRIGGER_TIME;

	if (sampleBufferNode !== undefined) {
		sampleGain.gain.setTargetAtTime(0, now, Synth.TRIGGER_TIME / 3);
		sampleBufferNode.stop(time);
		sampleBufferNode = undefined;
	}

	if ((gate & Synth.Gate.OPEN) !== 0) {
		const samplePlayer = new Synth.SamplePlayer(audioContext, sample);
		sampleBufferNode = samplePlayer.bufferNode;
		sampleBufferNode.playbackRate.value = Synth.noteFrequencies[note] * samplePlayer.samplePeriod;
		sampleBufferNode.loop = (gate & Synth.Gate.TRIGGER) !== Synth.Gate.TRIGGER;
		sampleBufferNode.connect(sampleGain);
		sampleGain.gain.setValueAtTime(samplePlayer.gain, time);
		sampleBufferNode.start(time);
	}
}

window.addEventListener('load', fitWidth);
window.addEventListener('resize', fitWidth);

function fitWidth(event) {
	const elementWidth = Math.trunc(outerContainer.clientWidth);
	canvas.width = elementWidth;
	overlay.width = elementWidth;
	if (waveWidth < elementWidth) {
		waveWidth = elementWidth;
	}
	resizeWaveform();
}

outerContainer.addEventListener('scroll', function (event) {
	waveOffset = Math.trunc(this.scrollLeft / waveWidth * bufferLength);
	requestAnimationFrame(redrawWaveform);
	overlay.focus();
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
		waveOffset = Math.trunc(outerContainer.scrollLeft / waveWidth * bufferLength);
		requestAnimationFrame(redrawWaveform);
	}
}

function redrawWaveform() {
	const startX = 0;
	const endX = canvas.width - 1;
	if (sample.buffer.numberOfChannels === 1) {
		drawWave(startX, endX, 128, 128, 128, 0);
	} else {
		drawWave(startX, endX, 64, 64, 64, 0);
		drawWave(startX, endX, 194, 64, 64, 1);
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
	let incX = 1;
	if (xScale < 1) {
		incX = Math.trunc(1 / xScale);
	}
	let x = startX;
	let audioY, pixelY;
	audioY = calculateY(data, x);
	pixelY = centre - Math.round(audioY * yScale);
	context2d.moveTo(startX, pixelY);

	if (x < selectionStartX) {
		x = selectionStartX - Math.ceil((selectionStartX - startX) * incX) / incX;
		while (x <= endX && x < selectionStartX) {
			audioY = calculateY(data, x);
			pixelY = centre - Math.round(audioY * yScale);
			context2d.lineTo(x, pixelY);
			x += incX;
		}
		audioY = calculateY(data, selectionStartX);
		pixelY = centre - Math.round(audioY * yScale);
		context2d.lineTo(selectionStartX, pixelY);
	}

	if (x <= endX && x < selectionEndX) {
		context2d.strokeStyle = waveColor;
		context2d.stroke();
		context2d.beginPath();
		context2d.moveTo(selectionStartX, pixelY);
		while (x <= endX && x < selectionEndX) {
			audioY = calculateY(data, x);
			pixelY = centre - Math.round(audioY * yScale);
			context2d.lineTo(x, pixelY);
			x += incX;
		}
		audioY = calculateY(data, selectionEndX);
		pixelY = centre - Math.round(audioY * yScale);
		context2d.lineTo(selectionEndX, pixelY);
		context2d.strokeStyle = selectedWaveColor;
		context2d.stroke();
		context2d.beginPath();
		context2d.moveTo(selectionEndX, pixelY);
	}

	while (x <= endX) {
		audioY = calculateY(data, x);
		pixelY = centre - Math.round(audioY * yScale);
		context2d.lineTo(x, pixelY);
		x += incX;
	}
	audioY = calculateY(data, endX);
	pixelY = centre - Math.round(audioY * yScale);
	context2d.lineTo(endX, pixelY);
	context2d.strokeStyle = waveColor;
	context2d.stroke();
	context2d.restore();
}

function drawOverlay() {
	overlayContext.clearRect(0, 0, overlay.width, overlay.height);
	const maxOffset = getMaxOffset();
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
	if (xScale <= 1) {
		return gain * data[Math.round(pixelX * xScale + waveOffset)];
	}

	const waveMinX = Math.max((pixelX - 0.5) * xScale + waveOffset, 0);
	const waveMaxX = Math.min((pixelX + 0.5) * xScale + waveOffset, data.length - 1);
	const firstX = Math.trunc(waveMinX);
	const first = gain * data[firstX];
	const firstPortion = waveMinX - firstX;
	const lastX = Math.ceil(waveMaxX);
	const last = gain * data[lastX];

	const lastPortion = 1 - (lastX - waveMaxX);
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

function setRange(min, max) {
	if (selectionStart <= selectionEnd) {
		selectionStart = min;
		selectionEnd = max;
	} else {
		selectionStart = max;
		selectionEnd = min;
	}
}

function getMaxOffset() {
	return Math.ceil(waveOffset + canvas.width * xScale);
}

function editSample(newInstrument, newSampleIndex) {
	instrument = newInstrument;
	sampleIndex = newSampleIndex;
	const newSample = newInstrument.samples[newSampleIndex];
	setSample(newSample, true);
}

function setSample(newSample, resize) {
	sample = newSample;
	if (instrument !== undefined) {
		instrument.samples[sampleIndex] = newSample;
	}
	if (sample === undefined) {
		bufferLength = 0;
	} else {
		const stereoButtons = document.getElementById('btns-stereo-sample');
		if (sample.buffer.numberOfChannels === 1) {
			stereoButtons.style.display = 'none';
		} else {
			stereoButtons.style.display = '';
		}
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

function scrollAndRedraw() {
	waveOffset = Math.trunc(waveOffset);
	const maxOffset = Math.trunc(bufferLength - canvas.width * xScale);
	if (waveOffset < 0) {
		waveOffset = 0;
	} else if (waveOffset > maxOffset) {
		waveOffset = maxOffset;
	}
	const scrollPosition = waveOffset / bufferLength * waveWidth;
	if (scrollPosition !== outerContainer.scrollLeft) {
		outerContainer.scrollLeft = scrollPosition;
	} else {
		requestAnimationFrame(redrawWaveform);
	}
	// Triggers a scroll event & thus redraws automatically.
}

function allowZoom() {
	return sample !== undefined && (xScale > 1 || canvas.width * xScale / sample.buffer.sampleRate >= 0.0004);
}

function repositionAfterZoom(zoomChange, maxOffset) {
	const viewWidth = canvas.width * xScale;
	const range = getRange();
	if (selectionStart === selectionEnd && selectionStart >= waveOffset && selectionStart < maxOffset) {
		// Preserve the visual cursor position
		waveOffset = selectionStart - (selectionStart - waveOffset) / zoomChange;
	} else if (zoomChange > 1 && range[0] >= waveOffset && range[0] < maxOffset) {
		// Zooming in, selection starts within the viewport
		if (range[1] < maxOffset) {
			// Selection end also within the viewport. Centre the selection.
			const zoomTo = (range[0] + range[1]) / 2;
			waveOffset = zoomTo - viewWidth / 2;
		} else {
			waveOffset += (maxOffset - waveOffset) / zoomMultiplier;
			if (range[0] < waveOffset + 0.1 * viewWidth) {
				waveOffset = range[0] - 0.1 * viewWidth
			}
		}
	} else if (!(range[1] >= waveOffset && range[1] < maxOffset)) {
		// Selection end not within the viewport. Zoom and preserve the centre point.
		waveOffset = waveOffset + (viewWidth * zoomChange) / 2 - viewWidth / 2
	} else if (range[1] > waveOffset + 0.9 * viewWidth) {
		waveOffset = range[1] - 0.9 * viewWidth;
	}
	scrollAndRedraw();
}

function zoomIn() {
	if (allowZoom()) {
		const maxOffset = getMaxOffset();
		zoomAmount *= zoomMultiplier;
		waveWidth = Math.round(canvas.width * zoomAmount);
		container.style.width = waveWidth + 'px';
		xScale = bufferLength / waveWidth;
		repositionAfterZoom(zoomMultiplier, maxOffset);
	}
}

function zoomOut() {
	const maxOffset = getMaxOffset();
	zoomAmount /= zoomMultiplier;
	if (zoomAmount < 1) {
		zoomAmount = 1;
	}
	waveWidth = Math.round(canvas.width * zoomAmount);
	container.style.width = waveWidth + 'px';
	xScale = bufferLength / waveWidth;
	repositionAfterZoom(1 / zoomMultiplier, maxOffset);
}

function zoomRange(from, to) {
	const viewWidth = Math.abs(to - from) + 1;
	xScale = viewWidth / canvas.width;
	waveWidth = Math.round(bufferLength / xScale);
	container.style.width = waveWidth + 'px';
	zoomAmount = waveWidth / canvas.width;
	waveOffset = from;
	scrollAndRedraw();
}

function zoomShowAll() {
	zoomAmount = 1;
	waveWidth = canvas.width;
	resizeWaveform();
}

document.getElementById('btn-zoom-sample-in').addEventListener('click', zoomIn);
document.getElementById('btn-zoom-sample-out').addEventListener('click', zoomOut);
document.getElementById('btn-zoom-sample-all').addEventListener('click', zoomShowAll);
document.getElementById('btn-zoom-sample-selection').addEventListener('click', function (event) {
	if (selectionStart !== selectionEnd) {
		zoomRange(selectionStart, selectionEnd);
	}
});

document.getElementById('btn-upload-sample').addEventListener('click', function (event) {
	document.getElementById('sample-upload-input').click();
});

document.getElementById('sample-upload-input').addEventListener('input', function (event) {
	const file = this.files[0];
	instrument.loadSampleFromFile(audioContext, 0, file)
	.then(function (resource) {
		instrument.guessOctave();
		MusicInput.keyboard.octave = instrument.defaultOctave;
		SampleEditor.editSample(instrument, 0);
	});
});

document.getElementById('btn-download-sample').addEventListener('click', function (event) {
	if (sample !== undefined) {
		const blob = sample.exportToWav();
		const linkElement = document.createElement('A');
		linkElement.style.display = 'none';
		document.body.appendChild(linkElement);
		linkElement.href = URL.createObjectURL(blob);
		linkElement.setAttribute('download', 'export.wav');
		linkElement.click();
		URL.revokeObjectURL(linkElement.href);
		document.body.removeChild(linkElement);
	}
});

document.getElementById('btn-play-sample').addEventListener('click', function (event) {
	if (sample !== undefined) {
		gate(Synth.Gate.TRIGGER, sample.sampledNote);
	}
});

function cut() {
	if (sample !== undefined) {
		const range = getRange();
		clipboard = sample.copy(range[0], range[1]);
		selectionStart = range[0];
		selectionEnd = selectionStart;
		setSample(sample.remove(range[0], range[1]), true);
	}
}

function copy(event) {
	if (sample !== undefined) {
		if (selectionStart === selectionEnd) {
			clipboard = sample.clone();
		} else {
			const range = getRange();
			clipboard = sample.copy(range[0], range[1]);
		}
	}
}

function paste(event) {
	if (sample !== undefined && clipboard !== undefined) {
		const range = getRange();
		if (selectionStart !== selectionEnd) {
			sample = sample.remove(range[0], range[1]);
		}
		sample.insert(clipboard, range[0]).then(function ([newSample, insertLength]) {
			setRange(range[0], range[0] + insertLength - 1);
			setSample(newSample, true);
		});
	}
}

function mix(event) {
	if (sample !== undefined && clipboard !== undefined) {
		if (selectionStart === selectionEnd) {
			sample.mix(clipboard, selectionStart, undefined, false).then(function ([newSample, changedLength]) {
				setRange(selectionStart, selectionStart + changedLength - 1);
				setSample(newSample, true);
			});
		} else {
			const range = getRange();
			const mixLength = range[1] - range[0] + 1;
			sample.mix(clipboard, range[0], mixLength, true).then(function ([newSample, changedLength]) {
				setRange(selectionStart, range[0] + changedLength - 1);
				setSample(newSample, false);
			});
		}
	}
}

document.getElementById('btn-cut-sample').addEventListener('click', cut);
document.getElementById('btn-copy-sample').addEventListener('click', copy);
document.getElementById('btn-paste-sample').addEventListener('click', paste);
document.getElementById('btn-mix-sample').addEventListener('click', mix);

document.getElementById('s-editor-menu-cut').addEventListener('click', function (event) {
	cut();
	hideContextMenu();
});

document.getElementById('s-editor-menu-copy').addEventListener('click', function (event) {
	copy();
	hideContextMenu();
});

document.getElementById('s-editor-menu-paste').addEventListener('click', function (event) {
	paste();
	hideContextMenu();
});

document.getElementById('s-editor-menu-mix').addEventListener('click', function (event) {
	mix();
	hideContextMenu();
});

document.getElementById('btn-swap-sample').addEventListener('click', function(event) {
	if (sample !== undefined && clipboard !== undefined) {
		const range = getRange();
		const cutPart = sample.copy(range[0], range[1]);
		sample = sample.remove(range[0], range[1]);
		sample.insert(clipboard, range[0]).then(function ([newSample, insertLength]) {
			setRange(range[0], range[0] + insertLength - 1);
			setSample(newSample, true);
		});
		clipboard = cutPart;
	}
});

document.getElementById('btn-zero-crossing').addEventListener('click', function(event) {
	if (selectionStart === selectionEnd) {
		selectionStart = sample.findZero(selectionStart, 0);
		selectionEnd = selectionStart;
		requestAnimationFrame(drawOverlay);
	} else {
		const range = getRange();
		let newSelectionStart = sample.findZero(range[0], 0);
		let newSelectionEnd = sample.findZero(range[1], 0);
		if (newSelectionStart === newSelectionEnd) {
			newSelectionStart = sample.findZero(range[0], 0, Synth.Direction.DOWN);
			newSelectionEnd = sample.findZero(range[1], 0, Synth.Direction.UP);
		}
		const data = sample.buffer.getChannelData(0);
		const deltaX = 5;
		const beginSlope = data[newSelectionStart + deltaX] - data[newSelectionStart];
		const endSlope = data[newSelectionEnd] - data[newSelectionEnd - deltaX];
		if ((beginSlope > 0 && endSlope < 0) || (beginSlope < 0 && endSlope > 0)) {
			// Try to prevent an audible click by selecting a whole number of cycles.
			let beforeBegin, afterBegin, beforeEnd, afterEnd;
			const slopeChanges = [Infinity, Infinity, Infinity, Infinity];
			if (newSelectionStart > 0) {
				beforeBegin = sample.findZero(newSelectionStart - 1, 0, Synth.Direction.DOWN);
				slopeChanges[0] = Math.abs(endSlope - (data[beforeBegin + deltaX] - data[beforeBegin]));
			}
			afterBegin = sample.findZero(newSelectionStart + 1, 0, Synth.Direction.UP);
			if (afterBegin < newSelectionEnd) {
				slopeChanges[1] = Math.abs(endSlope - (data[afterBegin + deltaX] - data[afterBegin]));
			}
			beforeEnd = sample.findZero(newSelectionEnd - 1, 0, Synth.Direction.DOWN);
			if (beforeEnd > newSelectionStart) {
				slopeChanges[2] = Math.abs(data[beforeEnd] - data[beforeEnd - deltaX] - beginSlope);
			}
			if (newSelectionEnd < bufferLength - 1) {
				afterEnd = sample.findZero(newSelectionEnd + 1, 0, Synth.Direction.UP);
				slopeChanges[3] = Math.abs(data[afterEnd] - data[afterEnd - deltaX] - beginSlope);
			}
			const minValue = Math.min(...slopeChanges);
			if (minValue !== Infinity) {
				const minIndex = slopeChanges.indexOf(minValue);
				switch (minIndex) {
				case 0:
					newSelectionStart = beforeBegin;
					break;
				case 1:
					newSelectionStart = afterBegin;
					break;
				case 2:
					newSelectionEnd = beforeEnd;
					break;
				case 3:
					newSelectionEnd = afterEnd;
					break;
				}
			}
		}
		setRange(newSelectionStart, newSelectionEnd);
		requestAnimationFrame(redrawWaveform);
	}
});

document.getElementById('btn-remove-dc').addEventListener('click', function(event) {
	if (sample !== undefined) {
		sample.removeOffset();
		requestAnimationFrame(redrawWaveform);
	}
});

document.getElementById('btn-normalize-sample').addEventListener('click', function(event) {
	if (sample !== undefined) {
		if (selectionStart === selectionEnd) {
			sample.normalize();
		} else {
			const range = getRange();
			sample.normalize(range[0], range[1]);
		}
		requestAnimationFrame(redrawWaveform);
	}
});

document.getElementById('btn-silence-sample').addEventListener('click', function(event) {
	if (sample !== undefined) {
		if (selectionStart === selectionEnd) {
			$('#insert-silence-modal').modal();
		} else {
			sample.amplify(0, selectionStart, selectionEnd);
			setSample(sample, false);
		}
	}
});

document.getElementById('btn-stereo-sep-sample').addEventListener('click', function(event) {
	if (sample !== undefined) {
		$('#stereo-separation-modal').modal();
	}
});

document.getElementById('btn-mono-sample').addEventListener('click', function(event) {
	if (sample !== undefined) {
		$('#reduce-to-mono-modal').modal();
	}
});

document.getElementById('btn-quantize-sample').addEventListener('click', function(event) {
	if (sample !== undefined) {
		$('#quantize-modal').modal();
	}
});

{
	const list = document.getElementById('sample-rates');
	const suggestions = [8363, 11025, 16726, 22050, 32000, 44100, 48000, 88200, 96000];
	const maxSampleRate = audioContext.sampleRate;
	for (let i = 0; i < suggestions.length && suggestions[i] <= maxSampleRate; i++) {
		const option = document.createElement('OPTION');
		option.value = suggestions[i];
		list.appendChild(option);
	}
}

document.getElementById('btn-resample-sample').addEventListener('click', function(event) {
	if (sample !== undefined) {
		$('#resample-modal').modal();
	}
});

$('#insert-silence-modal').on('shown.bs.modal', focusFirst);
$('#stereo-separation-modal').on('shown.bs.modal', focusFirst);
$('#reduce-to-mono-modal').on('shown.bs.modal', focusFirst);
$('#quantize-modal').on('shown.bs.modal', focusFirst);
$('#resample-modal').on('shown.bs.modal', focusFirst);

document.getElementById('insert-silence-form').addEventListener('submit', function(event) {
	event.preventDefault();
	const time = parseFloat(document.getElementById('silence-length').value);
	const length = Math.round(time * sample.buffer.sampleRate);
	selectionEnd = selectionStart + length - 1;
	setSample(sample.insertSilence(length, selectionStart), true);
	$('#insert-silence-modal').modal('hide');
});

document.getElementById('stereo-separation-form').addEventListener('submit', function(event) {
	event.preventDefault();
	const separation = parseFloat(document.getElementById('stereo-separation').value);
	if (selectionStart === selectionEnd) {
		sample.separateStereo(separation);
	} else {
		const range = getRange();
		sample.separateStereo(separation, range[0], range[1]);
	}
	requestAnimationFrame(redrawWaveform);
	$('#stereo-separation-modal').modal('hide');
});

document.getElementById('reduce-to-mono-form').addEventListener('submit', function(event) {
	event.preventDefault();
	const option = queryChecked(this, 'mono-reduce-type').value;

	if (selectionStart === selectionEnd) {
		switch (option) {
		case 'left':
			setSample(sample.channel(0), false);
			break;
		case 'right':
			setSample(sample.channel(1), false);
			break;
		case 'mix':
			const balance = parseFloat(document.getElementById('mono-reduce-balance').value);
			setSample(sample.mixToMono(balance), false);
			break;
		}
	} else {
		const range = getRange();
		let balance;
		switch (option) {
		case 'left':
			balance = 0;
			break;
		case 'right':
			balance = 1;
			break;
		case 'mix':
			balance = parseFloat(document.getElementById('mono-reduce-balance').value);
			break;
		}
		sample.duplicateChannel(balance, range[0], range[1]);
		requestAnimationFrame(redrawWaveform);
	}
	$('#reduce-to-mono-modal').modal('hide');
});

document.getElementById('quantize-form').addEventListener('submit', function(event) {
	event.preventDefault();
	const depth = parseInt(document.getElementById('quantize-bit-depth').value);
	if (selectionStart === selectionEnd) {
		setSample(sample.bitcrush(depth), false);
	} else {
		const range = getRange();
		setSample(sample.bitcrush(depth, range[0], range[1]), false);
	}
	$('#quantize-modal').modal('hide');
});

document.getElementById('resample-form').addEventListener('submit', function (event) {
	event.preventDefault();
	const newRate = parseInt(document.getElementById('resample-rate').value);
	const antialias = queryChecked(this, 'resample-antialiasing').value === 'true';
	const ratio = newRate / sample.buffer.sampleRate;
	selectionStart = Math.trunc(selectionStart * ratio);
	selectionEnd = Math.trunc(selectionEnd * ratio);
	if (antialias) {
		sample.smoothResample(newRate).then(function (newSample) {
			setSample(newSample, false);
			$('#resample-modal').modal('hide');
		});
	} else {
		setSample(sample.resample(newRate, false));
		$('#resample-modal').modal('hide');
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
		requestAnimationFrame(redrawWaveform);
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
		requestAnimationFrame(redrawWaveform);
	}
});

document.getElementById('btn-ping-pong').addEventListener('click', function(event) {
	if (sample !== undefined) {
		if (selectionStart === selectionEnd) {
			setSample(sample.pingPong(), true);
			zoomShowAll();
		} else {
			const range = getRange();
			const endOffset = 2 * range[1] - range[0];
			setRange(range[0], endOffset);
			setSample(sample.pingPong(range[0], range[1]))
			const maxOffset = getMaxOffset();
			if (endOffset >= maxOffset) {
				zoomRange(waveOffset, endOffset);
			}
		}
	}
});

overlay.addEventListener('contextmenu', function (event) {
	event.preventDefault();
  	const left = event.offsetX - 23;
	const top = event.offsetY + 8;
  	const menu = document.getElementById('s-editor-context-menu');
  	const style = menu.style;
  	style.left = left + 'px';
  	style.top = top + 'px';
  	menu.classList.add('show');
});

function hideContextMenu() {
  	document.getElementById('s-editor-context-menu').classList.remove('show');
}

overlay.addEventListener('pointerdown', function (event) {
	if (sample === undefined || event.button !== 0) {
		return;
	}
	hideContextMenu();

	const x = event.offsetX;
	if (event.offsetY >= HEADER_HEIGHT) {
		const needDrawWave = selectionStart !== selectionEnd || event.shiftKey;
		if (event.shiftKey) {
			selectionEnd = calculateOffset(x);
		} else {
			selectionStart = calculateOffset(x);
			selectionEnd = selectionStart;
		}
		if (needDrawWave) {
			requestAnimationFrame(redrawWaveform);
		} else {
			requestAnimationFrame(drawOverlay);
		}
		dragging = Drag.RANGE;
		return;
	}

	const maxOffset = getMaxOffset();
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
	if (loopEnd - loopStart < xScale) {
		dragging = Drag.LOOP;
	} else if (loopEnd >= waveOffset && loopEnd < maxOffset) {
		const loopEndX = calculateX(loopEnd);
		const distance = Math.abs(x - loopEndX);
		if (distance <= 10 && (distance < distanceToNearest)) {
			dragging = Drag.LOOP_END;
			distanceToNearest = distance;
		}
	}
});

overlay.addEventListener('pointermove', function (event) {
	const x = event.offsetX;
	switch (dragging) {
	case Drag.RANGE: {
		const offsetX = calculateOffset(x);
		selectionEnd = offsetX;
		requestAnimationFrame(redrawWaveform);
		break;
	}

	case Drag.LOOP: {
		const loopEnd = Math.min(sample.loopEnd, bufferLength - 1);
		let offset = calculateOffset(x);
		if (offset < sample.loopStart) {
			if (sample.loopStart - offset >= xScale) {
				dragging = Drag.LOOP_START;
			}
			sample.loopStart = offset;
			requestAnimationFrame(drawOverlay);
		} else if (offset > loopEnd) {
			if (offset - loopEnd >= xScale) {
				dragging = Drag.LOOP_END;
			}
			sample.loopEnd = offset;
			requestAnimationFrame(drawOverlay);
		}
		break;
	}

	case Drag.LOOP_START: {
		let loopStart = calculateOffset(x);
		const loopEnd = Math.min(sample.loopEnd, bufferLength - 1);
		if (loopStart < 0) {
			loopStart = 0;
		} else if (loopStart > loopEnd) {
			loopStart = loopEnd;
		}
		sample.loopStart = loopStart;
		requestAnimationFrame(drawOverlay);
		break;
	}

	case Drag.LOOP_END: {
		const loopStart = sample.loopStart;
		let loopEnd = calculateOffset(x);
		if (loopEnd < loopStart) {
			loopEnd = loopStart;
		} else if (loopEnd > bufferLength - 1) {
			loopEnd = Number.MAX_VALUE;
		}
		sample.loopEnd = loopEnd;
		requestAnimationFrame(drawOverlay);
		break;
	}
	}
});

overlay.addEventListener('pointerup', function (event) {
	dragging = Drag.NONE;
});

overlay.addEventListener('mouseenter', function (event) {
	if (event.buttons !== 1) {
		dragging = Drag.NONE;
	}
});

document.getElementById('waveform-inner-container').addEventListener('blur', function (event) {
	hideContextMenu();
});

overlay.addEventListener('wheel', function (event) {
	let viewWidth = canvas.width * xScale;
	let scale = 1;
	switch (event.deltaMode) {
	case 0: // Pixels
		scale = xScale * 3;
		break;
	case 1: // Lines
		scale = viewWidth / 44;
		break;
	case 2: // Pages
		scale = viewWidth;
		break;
	}

	let delta = event.deltaX;
	if (delta === 0) {
		delta = event.deltaY // for standard mice
		if (event.ctrlKey) { // Ctrl on Mac also
			event.preventDefault();
			// A negative amount means to zoom out
			if (delta > 0 || allowZoom()) {
				const maxOffset = getMaxOffset();
				const amount = delta * scale * 3;
				viewWidth += 2 * amount;
				if (viewWidth > bufferLength) {
					viewWidth = bufferLength;
				}
				xScale = viewWidth / canvas.width;
				waveWidth = Math.round(bufferLength / xScale);
				container.style.width = waveWidth + 'px';
				const oldZoomAmount = zoomAmount;
				zoomAmount = waveWidth / canvas.width;
				repositionAfterZoom(zoomAmount / oldZoomAmount, maxOffset);
			}
			return;
		}
	}

	waveOffset += Math.ceil(scale * delta * xScale) / xScale;
	scrollAndRedraw();
});

document.getElementById('sample-editor').addEventListener('keydown', function (event) {
	const incrementSize = Math.ceil(xScale * (event.repeat ? 6 : 1));
	const ctrl = event.ctrlKey ^ event.metaKey;
	let viewWidth, lastPage;

	switch (event.key) {
	case 'a':
		if (ctrl) {
			selectionStart = 0;
			selectionEnd = bufferLength - 1;
			zoomShowAll();
		}
		break;

	case 'ArrowLeft':
		if (event.shiftKey) {

			selectionEnd -= incrementSize;
			if (selectionEnd < 0) {
				selectionEnd = 0;
			} else if (Math.abs(selectionEnd - selectionStart) < xScale) {
				selectionEnd = selectionStart;
			}
			requestAnimationFrame(redrawWaveform);

		} else if (selectionStart === selectionEnd) {

			selectionStart -= incrementSize;
			if (selectionStart < 0) {
				selectionStart = 0;
			}
			selectionEnd = selectionStart;
			if (selectionStart < waveOffset) {
				selectionStart -= 14;
				if (selectionStart < 0) {
					selectionStart = 0;
				}
				selectionEnd = selectionStart
				waveOffset = selectionStart;
				scrollAndRedraw();
			} else {
				requestAnimationFrame(drawOverlay);
			}

		}
		break;

	case 'ArrowRight':
		if (event.shiftKey) {

			selectionEnd += incrementSize;
			if (selectionEnd >= bufferLength) {
				selectionEnd = bufferLength - 1;
			} else if (Math.abs(selectionEnd - selectionStart) < xScale) {
				selectionEnd = selectionStart;
			}
			requestAnimationFrame(redrawWaveform);

		} else if (selectionStart === selectionEnd) {

			selectionStart += incrementSize;
			if (selectionStart >= bufferLength) {
				selectionStart = bufferLength - 1;
			}
			selectionEnd = selectionStart;
			requestAnimationFrame(drawOverlay);

		}
		break;

	case 'PageUp':
		lastPage = waveOffset === 0;
		viewWidth = canvas.width * xScale;
		waveOffset -= viewWidth;
		if (event.shiftKey) {
			// Extend or reduce the size of the selection
			const newSelectionEnd = Math.ceil(selectionEnd - viewWidth);
			if (selectionEnd > selectionStart && newSelectionEnd < selectionStart ||
				selectionEnd < selectionStart && newSelectionEnd > selectionStart
			) {
				// Collapse selection first, before flipping it's direction
				selectionEnd = selectionStart;
			} else {
				selectionEnd = newSelectionEnd;
			}
			// If necessary, relocate the view to match the selection
			if (selectionEnd >= selectionStart) {
				// Left to right selection
				if (selectionEnd > waveOffset + viewWidth - xScale) {
					waveOffset = selectionEnd - viewWidth + xScale;
				} else if (selectionEnd < waveOffset + xScale) {
					waveOffset = selectionEnd - 40 * xScale;
				}
			} else {
				// Right to left selection
				if (selectionEnd > waveOffset + viewWidth - xScale) {
					waveOffset = selectionEnd;
				} else if (selectionEnd < waveOffset) {
					waveOffset = selectionEnd - 40 * xScale;
				}
			}
			if (selectionEnd < 0) {
				selectionEnd = 0;
			}

		} else if (selectionStart === selectionEnd) {

			// Pan without changing the length of the selection
			if (waveOffset < 0) {
				waveOffset = 0;
			}

			if (lastPage) {
				selectionStart = 0;
			} else if (selectionStart > waveOffset + viewWidth - xScale) {
				// Position the cursor on the right hand side
				selectionStart = waveOffset + viewWidth - xScale;
			} else if (selectionStart < waveOffset) {
				// Position the cursor on the left hand side
				selectionStart = waveOffset;
			}
			if (selectionStart < 0) {
				selectionStart = 0;
			}
			selectionEnd = selectionStart;
		}
		scrollAndRedraw();
		break;

	case 'Home':
		if (!event.shiftKey) {
			selectionStart = 0;
		}
		selectionEnd = 0;
		waveOffset = 0;
		scrollAndRedraw();
		break;

	case 'End':
		if (!event.shiftKey) {
			selectionStart = bufferLength - 1;
		}
		selectionEnd = bufferLength - 1;
		waveOffset = bufferLength - canvas.width * xScale;
		scrollAndRedraw();
		break;

	case 'Delete':
		const range = getRange();
		selectionStart = range[0];
		selectionEnd = selectionStart;
		setSample(sample.remove(range[0], range[1]), true);
		break;

	case '=':
		if (ctrl) {
			event.preventDefault();
			zoomIn();
		}
		break;

	case '-':
		if (ctrl) {
			event.preventDefault();
			zoomOut();
		}
		break;

	case '0':
		if (ctrl) {
			event.preventDefault();
			zoomShowAll();
		}
		break;
	}
});

global.SampleEditor = {
	editSample: editSample,
	gate: gate,
};

})(window);

function focusFirst() {
	const element = this.querySelector('input:enabled:not(:read-only):not([display=none])');
	if (element.type === 'radio') {
		const selected = queryChecked(this, element.name);
		if (selected === null) {
			element.focus();
		} else {
			selected.focus();
		}
	} else {
		element.focus();
		if (element.select instanceof Function) {
			element.select();
		}
	}
}

function queryChecked(ancestor, name) {
	return ancestor.querySelector(`:checked[type=radio][name=${name}]`);
}

let instrument = new Synth.SampledInstrument('Instrument 1');
instrument.loadSampleFromURL(audioContext, 0, 'samples/acoustic-grand-piano.wav')
.then(function (resource) {
	instrument.guessOctave();
	MusicInput.keyboard.octave = instrument.defaultOctave;
	SampleEditor.editSample(instrument, 0);
});

MusicInput.keyboard.addEventListener('synthinput', function (event) {
	if (audioContext.state === 'suspended') {
		audioContext.resume();
	}
	const changes = event.changes;
	const gateChange = changes.get(Synth.Param.GATE);
	if (gateChange !== undefined) {
		const gate = gateChange.value;
		const noteChange = changes.get(Synth.Param.NOTES);
		const note = noteChange === undefined ? undefined : noteChange.value[0];
		SampleEditor.gate(gate, note);
	}
});

document.getElementById('btn-play-sample').addEventListener('click', function (event) {
	if (audioContext.state === 'suspended') {
		audioContext.resume();
	}
});
