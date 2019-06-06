const TWO_PI = 2 * Math.PI;
const BUFFER_LENGTH = 5;
const audioContext = new AudioContext();
const system = new Synth.System(audioContext);
let gateTemporarilyOpen = false;
let octaveOffset = 0;
let channels, piecewiseLinear;

document.getElementById('input-device').prepend(Sampler.devices);

system.ondatarecorded = function (blob) {
	const mediaElement = document.getElementById('recording');
	if (mediaElement.src.startsWith('blob:')) {
		URL.revokeObjectURL(mediaElement.src);
	}
	mediaElement.src = URL.createObjectURL(blob);
}

function set(parameterNumber, value, delay, changeType, channelNumber) {
	system.set(parameterNumber, value, delay, changeType, channelNumber);
}

function setMachine(machine, parameterNumber, value, delay, changeType, channelNumber) {
	system.setMachine(machine, parameterNumber, value, delay, changeType, channelNumber);
}

function initialize() {
	audioContext.resume();
	let channel1 = new Synth.SubtractiveSynthChannel(system, true);
	let channel2 = new Synth.SubtractiveSynthChannel(system, true);
	channel2.connect(channel1);
	piecewiseLinear = new Machines.PiecewiseLinear(audioContext, 'none');
	piecewiseLinear.connect(channel1.oscillator, channel1.oscillatorGain);
	channels = [channel1, channel2];

	system.start();

	const parameterMap = new Map();
	parameterMap.set(Synth.Param.FILTER_MIX, new Synth.Change(Synth.ChangeType.SET, 0));
	parameterMap.set(Synth.Param.UNFILTERED_MIX, new Synth.Change(Synth.ChangeType.SET, 100));
	parameterMap.set(Synth.Param.ATTACK_CURVE, new Synth.Change(Synth.ChangeType.SET, 3));
	parameterMap.set(Synth.Param.DELAY, new Synth.Change(Synth.ChangeType.SET, 1));
	channels[0].setParameters(parameterMap);

	sendNewLine();
	setInterval(sendNewLine, BUFFER_LENGTH * 20);

	const piano = new Synth.SampledInstrument();
	system.instruments[0] = piano;
	piano.loadSampleFromURL(audioContext, 0, 'samples/acoustic-grand-piano.wav').then(resourceLoaded).catch(resourceError);
	const guitar = new Synth.SampledInstrument();
	system.instruments[1] = guitar;
	guitar.loadSampleFromURL(audioContext, 0, 'samples/guitar-strum.wav')
	.then(resourceLoaded)
	.then(function (resource) {
		resource.data.sampledNote = 55;
	})
	.catch(resourceError);

	const violin = new Synth.SampledInstrument();
	system.instruments[2] = violin;
	violin.loadSampleFromURL(audioContext, 0, 'samples/violin.wav')
	.then(resourceLoaded)
	.then(function (resource) {
		resource.data.sampledNote = 46;
	})
	.catch(resourceError);

	document.getElementById('intro').style.display = 'none';
	document.getElementById('controls').style.display = 'block';
}

const emptyMap = new Map();
function sendNewLine() {
	if ((channels[0].parameters[Synth.Param.GATE] & Synth.Gate.TRIGGER) === Synth.Gate.OPEN) {
		const now = system.nextStep();
		let nextLine = Math.max(now, system.nextLine);
		const bufferUntil = now + BUFFER_LENGTH;
		while (nextLine <= bufferUntil) {
			channels[0].setParameters(emptyMap, nextLine, true);
			nextLine = system.nextLine;
		}
	}
}

function playNote(gate) {
	const noteNumber = parseInt(document.getElementById('note').value);
	document.getElementById('frequency').value = channels[0].noteFrequencies[noteNumber];
	const notes = [noteNumber];
	const chord = document.getElementById('chord').value;
	const strLen = chord.length;
	let charIndex = 0;
	while (charIndex < strLen) {
		let char = chord[charIndex];
		let interval;
		if (char === '-') {
			charIndex++;
			if (charIndex < strLen) {
				interval = -parseInt(chord[charIndex], 36);
			} else {
				break;
			}
		} else {
			interval = parseInt(chord[charIndex], 36) - 1;
		}
		charIndex++;
		if (!Number.isNaN(interval)) {
			notes.push(noteNumber + interval);
		}
	}
	const parameterMap = new Map();
	parameterMap.set(Synth.Param.NOTES, new Synth.Change(Synth.ChangeType.SET, notes));
	if ((channels[0].parameters[Synth.Param.GATE] & Synth.Gate.TRIGGER) !== Synth.Gate.OPEN) {
		parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, gate));
	}
	channels[0].setParameters(parameterMap, undefined, true);
}

function openGateTemporarily() {
	if (channels[0].parameters[Synth.Param.GATE] & 3 !== Synth.Gate.OPEN) {
		set(Synth.Param.GATE, Synth.Gate.REOPEN);
		gateTemporarilyOpen = true;
	}
}

function closeGateOpenedTemporarily() {
	if (gateTemporarilyOpen) {
		set(Synth.Param.GATE, Synth.Gate.CLOSED);
		gateTemporarilyOpen = false;
	}
}

function calcGroove(str) {
	const strings = str.split(',');
	const groove = [];
	for (s of strings) {
		const number = parseFloat(s);
		if (number >= 1) {
			groove.push(number);
		}
	}
	if (groove.length === 0) {
		groove[0] = parseFloat(document.getElementById('line-time').value);
	} else if (groove.length === 1) {
		document.getElementById('line-time').value = groove[0];
	}
	set(Synth.Param.GROOVE, groove);
}

document.addEventListener('keydown', function (event) {
	if (event.repeat || event.shiftKey || event.altKey || event.ctrlKey) {
		return;
	}
	const elementType = document.activeElement.type;
	if (elementType === 'text' || elementType === 'number') {
		return;
	}

	const code = event.code;

	if (code === 'Quote') {
		set(Synth.Param.GATE, Synth.Gate.CUT);
		event.preventDefault();
	} else if (code === 'NumpadDivide') {
		octaveOffset--;
		if (octaveOffset < -3) {
			octaveOffset = -3;
		}
		event.preventDefault();
	} else if (code === 'NumpadMultiply') {
		octaveOffset++;
		if (octaveOffset > 4) {
			octaveOffset = 4;
		}
		event.preventDefault();
	} else {
		const note = Synth.keymap.get(code);
		if (note !== undefined) {
			document.getElementById('note').value = octaveOffset * 12 + note;
			let gate;
			if (document.getElementById('one-shot').checked) {
				gate = Synth.Gate.TRIGGER;
			} else {
				gate = Synth.Gate.OPEN;
			}
			if (!document.getElementById('retrigger').checked) {
				gate = gate + Synth.Gate.MULTI_TRIGGERABLE;
			}
			playNote(gate);
			event.preventDefault();
		}
	}
});

document.addEventListener('keyup', function (event) {
	if (event.shiftKey || event.altKey || event.ctrlKey ||
		document.activeElement.type === 'text'
	) {
		return;
	}

	const note = Synth.keymap.get(event.code);
	if (note !== undefined) {
		if (!document.getElementById('one-shot').checked) {
			set(Synth.Param.GATE, Synth.Gate.CLOSED);
			event.preventDefault();
		}
	}
});

function resourceLoaded(resource) {
	let name;
	if (resource.source instanceof File) {
		name = resource.source.name;
	} else {
		name = resource.source;
	}
	console.log('Loaded ' + name);
	return resource;
}

function resourceError(error) {
	console.error(error.source + ': ' + error.message);
}

function uploadSamples() {
	const files = document.getElementById('sample-upload').files;
	const dropDown = document.getElementById('sample-list');
	const offset = dropDown.children.length - 1;
	for (let i = 0; i < files.length; i++) {
		const option = document.createElement('option');
		option.value = offset + i;
		option.appendChild(document.createTextNode(files[i].name));
		dropDown.appendChild(option);
	}

	for (let i = 0; i < files.length; i++) {
		const instrument = new Synth.SampledInstrument();
		system.instruments[offset + i] = instrument;
		instrument.loadSampleFromFile(audioContext, 0, files[i]).then(resourceLoaded);
	}
}

function pauseRecording() {
	if (system.recordingState === 'paused') {
		system.resumeRecording();
	} else {
		system.requestRecording();
		system.pauseRecording();
	}
}

Sampler.ondatarecorded = function (buffer) {
	const dropDown = document.getElementById('sample-list');
	const instrumentNumber = dropDown.children.length - 1;
	const sample = new Synth.Sample(buffer);
	const instrument = new Synth.SampledInstrument();
	instrument.addSample(0, sample);
	system.instruments.push(instrument);
	const option = document.createElement('option');
	option.value = instrumentNumber;
	option.appendChild(document.createTextNode('Recording ' + instrumentNumber));
	dropDown.appendChild(option);
}

document.getElementById('sampler-btn').addEventListener('click', function (event) {
	if (Sampler.recording) {
		Sampler.stopRecording();
		event.currentTarget.children[0].src = 'img/record.png';
	} else {
		Sampler.requestPermission().then(function () {
			Sampler.startRecording();
			document.getElementById('sampler-btn').children[0].src = 'img/stop.png';
		});
	}
});

let graphPointsX = [0, 31];
let graphPointsY = [-1, 1];

function updateGraphedSound() {
	if (channels !== undefined) {
		const machineChanges = [
			new Synth.MachineChange(piecewiseLinear, Machines.PiecewiseLinear.Param.X_VALUES, Synth.ChangeType.SET, graphPointsX),
			new Synth.MachineChange(piecewiseLinear, Machines.PiecewiseLinear.Param.Y_VALUES, Synth.ChangeType.SET, graphPointsY),
		];
		const parameterMap = new Map();
		parameterMap.set(Synth.Param.MACHINE, machineChanges);
		channels[0].setParameters(parameterMap, undefined, false);
	}
}

const canvas = document.getElementById('graph-canvas');
const context2d = canvas.getContext('2d');
const graphMarkRadius = 5;
context2d.setTransform(1, 0, 0, 1, 0.5 + graphMarkRadius, 0.5 + graphMarkRadius);
let graphWidth, graphHeight, graphMidY;
let graphUnitX, graphGridHeight, graphSnapY;
let graphMouseX, graphMouseY, graphChangeX;

function resizeGraph() {
	graphWidth = canvas.width - 2 * graphMarkRadius - 0.5;
	graphHeight = canvas.height - 2 * graphMarkRadius - 0.5;
	graphMidY = graphHeight / 2;
	const numValues = graphPointsX.length;
	graphUnitX = graphWidth / graphPointsX[numValues - 1];
	graphGridHeight = document.getElementById('graph-grid-y').value;
	graphSnapY = document.getElementById('graph-snap-y').checked;
	if (graphSnapY) {
		const halfGridHeight = graphGridHeight / 2;
		for (let i = 0; i < numValues; i++) {
			graphPointsY[i] = Math.round(graphPointsY[i] * halfGridHeight) / halfGridHeight;
		}
		updateGraphedSound();
	}
	requestAnimationFrame(drawGraph);
}

function drawGraph() {
	context2d.clearRect(-0.5 - graphMarkRadius, -0.5 - graphMarkRadius, graphWidth + 2 * graphMarkRadius + 0.5, graphHeight + 2 * graphMarkRadius + 0.5);
	context2d.beginPath();
	context2d.moveTo(-graphMarkRadius, graphMidY);
	context2d.lineTo(graphWidth + graphMarkRadius, graphMidY);
	context2d.strokeStyle = 'grey';
	context2d.stroke();

	const numValues = graphPointsX.length;
	context2d.beginPath();
	context2d.moveTo(0, Math.round(graphMidY - graphPointsY[0] * graphMidY));
	for (let i = 1; i < numValues; i++) {
		const x = Math.round(graphPointsX[i] * graphUnitX);
		const y = Math.round(graphMidY - graphPointsY[i] * graphMidY);
		context2d.lineTo(x, y);
	}
	context2d.strokeStyle = 'black';
	context2d.stroke();

	context2d.beginPath();
	context2d.fillStyle = 'black';
	for (let i = 0; i < numValues; i++) {
		const x = Math.round(graphPointsX[i] * graphUnitX);
		const y = Math.round(graphMidY - graphPointsY[i] * graphMidY);
		context2d.arc(x, y, graphMarkRadius, 0, TWO_PI);
		context2d.fill();
		context2d.beginPath();
	}
	if (graphMouseX !== undefined) {
		context2d.fillStyle = 'red';
		context2d.arc(graphMouseX * graphUnitX, graphMidY - graphMouseY * graphMidY, graphMarkRadius, 0, TWO_PI);
		context2d.fill();
	}
}
resizeGraph();

canvas.addEventListener('mousemove', function (event) {
	const maxX = graphPointsX[graphPointsX.length - 1];
	let x = Math.round((event.offsetX - graphMarkRadius - 0.5) / graphUnitX);
	if (x < 0) {
		x = 0;
	} else if (x > maxX) {
		x = maxX;
	}
	let y = 1 - Math.round(event.offsetY - graphMarkRadius - 0.5) / graphMidY;
	let roundedY;
	if (y < -1) {
		y = -1;
		roundedY = -1;
	} else if (y > 1) {
		y = 1;
		roundedY = 1;
	} else if (graphSnapY) {
		const halfGridHeight = graphGridHeight / 2;
		roundedY = Math.round(y * halfGridHeight);
		y = roundedY / halfGridHeight;
	} else {
		roundedY = Math.round(y * 100) / 100;
	}

	if (x != graphMouseX || y !== graphMouseY) {
		graphMouseX = x;
		graphMouseY = y;
		requestAnimationFrame(drawGraph);
		document.getElementById('mouse-coords').innerHTML = 'x: ' + x + ', y: ' + roundedY;
	}
});

canvas.addEventListener('mouseleave', function (event) {
	graphMouseX = undefined;
	requestAnimationFrame(drawGraph);
	document.getElementById('mouse-coords').innerHTML = '&nbsp;'
});

canvas.addEventListener('mousedown', function (event) {
	graphChangeX = graphMouseX;
	const numValues = graphPointsX.length;
	for (let i = 0; i < numValues; i++) {
		const x = graphPointsX[i];
		if (graphChangeX === x) {
			graphPointsY[i] = graphMouseY;
			break;
		} else if (graphChangeX < x) {
			graphPointsX.splice(i, 0, graphChangeX);
			graphPointsY.splice(i, 0, graphMouseY);
			break;
		}
	}
	updateGraphedSound();
	requestAnimationFrame(drawGraph);
});

canvas.addEventListener('dblclick', function (event) {
	const numValues = graphPointsX.length;
	if (graphMouseX === 0 || graphMouseX === graphPointsX[numValues - 1]) {
		return;
	}
	for (let i = 0; i < numValues; i++) {
		const x = graphPointsX[i];
		if (graphMouseX === x) {
			graphPointsX.splice(i, 1);
			graphPointsY.splice(i, 1);
			updateGraphedSound();
			requestAnimationFrame(drawGraph);
			break;
		} else if (graphMouseX < x) {
			break;
		}
	}
});

function resetGraph() {
	graphPointsX = [0, 31];
	graphPointsY = [-1, 1];
	updateGraphedSound();
	requestAnimationFrame(drawGraph);
}
