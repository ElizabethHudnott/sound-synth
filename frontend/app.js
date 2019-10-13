const BUFFER_LENGTH = 5;
const audioContext = new AudioContext({latencyHint: 0.06});
let debug = {input: false};
const system = new Synth.System(audioContext, initialize);
const channels = system.channels;
const keyboard = MusicInput.keyboard;
const generator = new SongGenerator();
let gateTemporarilyOpen = false;
let inputPort, inputChannel = 0, chord = [0];
let numRecordings = 0;

document.getElementById('recording-device').prepend(Sampler.devices);

{
	const select = MusicInput.ports;
	const div = document.getElementById('input-config');
	div.insertBefore(select, div.children[0]);

	select.addEventListener('input', function (event) {
		if (inputPort !== undefined) {
			inputPort.close();
		}
		inputPort = MusicInput.port(this.value);
		inputPort.open();
		inputPort.addEventListener('synthinput', processInput);
		applyInputMode();
		applyGateSetting();
	});
}

document.getElementById('btn-fill-in').addEventListener('click', function (event) {
	const phrase = generator.generatePhrase();
	system.stop();
	phrase.play(system);
});

document.getElementById('chord').addEventListener('input', function (event) {
	chord = [0];
	const chordText = this.value;
	const strLen = chordText.length;
	let charIndex = 0;
	while (charIndex < strLen) {
		let char = chordText[charIndex];
		let interval;
		if (char === '-') {
			charIndex++;
			if (charIndex < strLen) {
				interval = -parseInt(chordText[charIndex], 36);
			} else {
				break;
			}
		} else {
			interval = parseInt(chordText[charIndex], 36) - 1;
		}
		charIndex++;
		if (!Number.isNaN(interval)) {
			chord.push(interval);
		}
	}
	if (document.getElementById('input-mode-transpose-chord').checked) {
		keyboard.chord[0] = chord;
		if (inputPort !== undefined) {
			inputPort.chord[inputChannel] = chord;
		}
	}
	playNote();
});

function applyInputMode() {
	if (inputPort === undefined) {
		return;
	}

	inputPort.legato[inputChannel] = false;

	if (document.getElementById('input-mode-mono').checked) {
		inputPort.toChannel[inputChannel] = 0;
		inputPort.enableArpeggio(inputChannel, false);
		inputPort.chord[inputChannel] = [0];
		inputPort.setLockDown(inputChannel, false);
	} else if (document.getElementById('input-mode-poly').checked) {
		inputPort.toChannel[inputChannel] = channels.length - 1;
		inputPort.enableArpeggio(inputChannel, false);
		inputPort.chord[inputChannel] = [0];
		inputPort.setLockDown(inputChannel, false);
	} else if (document.getElementById('input-mode-arp').checked) {
		inputPort.enableArpeggio(inputChannel, true);
		inputPort.setLockDown(inputChannel, false);
	} else { // Transposed chord mode
		inputPort.toChannel[inputChannel] = channels.length - 1;
		inputPort.enableArpeggio(inputChannel, false);
		inputPort.chord[inputChannel] = chord;
		inputPort.lockDown[inputChannel] = true;
	}
}

function applyGateSetting() {
	let gate;
	if (document.getElementById('one-shot').checked) {
		gate = Synth.Gate.TRIGGER;
	} else {
		gate = Synth.Gate.OPEN;
	}
	if (document.getElementById('legato').checked) {
		gate = gate + Synth.Gate.LEGATO;
	}

	if (!keyboard.split) {
		keyboard.gate[0] = gate;
	} else {
		keyboard.gate[0] = gate & Synth.Gate.REOPEN;
	}
	keyboard.gate[1] = gate;

	if (inputPort !== undefined) {
		inputPort.gate[inputChannel] = gate;
	}
}

document.getElementById('input-channel').addEventListener('input', function (event) {
	if (inputPort === undefined) {
		return;
	}

	const newChannel = parseInt(this.value);
	inputPort.fromChannel[inputChannel] = undefined;
	inputPort.fromChannel[newChannel] = 0;
	inputChannel = newChannel;
	applyInputMode();
	applyGateSetting();
});

document.getElementById('input-mode-mono').addEventListener('input', function (event) {
	keyboard.split = false;
	keyboard.toChannel[0] = 0;
	keyboard.enableArpeggio(0, false);
	keyboard.chord[0] = [0];
	keyboard.setLockDown(0, false);
	applyInputMode();
});

document.getElementById('input-mode-poly').addEventListener('input', function (event) {
	keyboard.split = false;
	keyboard.toChannel[0] = channels.length - 1;
	keyboard.enableArpeggio(0, false);
	keyboard.chord[0] = [0];
	keyboard.setLockDown(0, false);
	applyInputMode();
});

document.getElementById('input-mode-arp').addEventListener('input', function (event) {
	keyboard.split = false;
	keyboard.enableArpeggio(0, true);
	keyboard.setLockDown(0, false);
	applyInputMode();
});

document.getElementById('input-mode-transpose-chord').addEventListener('input', function (event) {
	keyboard.split = true;
	keyboard.toChannel[0] = 0;
	keyboard.enableArpeggio(0, false);
	keyboard.chord[0] = chord;
	keyboard.lockDown[0] = true;
	applyInputMode();
});

function toggleSound() {
	const transposeMode = document.getElementById('input-mode-transpose-chord').checked;
	if (keyboard.isLockedDown[0]) {
		if (transposeMode) {
			keyboard.allSoundOff();
		} else {
			keyboard.setLockDown(0, false);
		}
	} else {
		keyboard.setLockDown(0, true);
	}
	if (inputPort !== undefined) {
		if (inputPort.isLockedDown[inputChannel]) {
			if (transposeMode) {
				inputPort.allSoundOff();
			} else {
				inputPort.setLockDown(inputChannel, false);
			}
		} else {
			inputPort.setLockDown(inputChannel, true);
		}
	}
}

window.addEventListener('blur', function (event) {
	const transposeMode = document.getElementById('input-mode-transpose-chord').checked;
	if (!transposeMode) {
		keyboard.lockDown[0] = false;
	}
});

system.ondatarecorded = function (blob) {
	const mediaElement = document.getElementById('recording');
	if (mediaElement.src.startsWith('blob:')) {
		URL.revokeObjectURL(mediaElement.src);
	}
	mediaElement.src = URL.createObjectURL(blob);
}

function set(parameterNumber, value, delay, changeType, channelNumber) {
	if (channelNumber === undefined) {
		channelNumber = -1;
	}
	system.set(parameterNumber, value, delay, changeType, channelNumber);
}

function setMacro(macro, value, delay, changeType, channelNumber) {
	system.setMacro(macro, value, delay, changeType, channelNumber);
}

function setMachine(machine, parameterNumber, value, delay, changeType, channelNumber) {
	system.setMachine(machine, parameterNumber, value, delay, changeType, channelNumber);
}

function setTempoAutomation(parameterNumber, power, channelNumber) {
	system.setTempoAutomation(parameterNumber, power, channelNumber);
}

function removeTempoAutomation(parameterNumber, channelNumber) {
	system.removeTempoAutomation(parameterNumber, channelNumber);
}

function processInput(event) {
	if (debug.input) {
		console.log('Input received.');
		console.log('Synth channels: ' + event.channels);
		console.log('Parameters:');
		for (let [key, change] of event.changes) {
			console.log('\t' + key + ' -> ' + change.value);
		}
	}
	if (this !== inputPort && this !== keyboard) {
		return;
	}

	const changes = event.changes;
	const noteChange = changes.get(Synth.Param.NOTES);
	if (noteChange !== undefined) {
		const note = noteChange.value[0];
		document.getElementById('note').value = note;
		document.getElementById('frequency').value = channels[0].noteFrequencies[note];
	}
	const numChannels = channels.length;
	for (let channelNumber of event.channels) {
		if (channelNumber < numChannels) {
			channels[channelNumber].setParameters(changes, undefined, true);
		}
	}
}

// Sends a simulated MIDI message.
function testInput(channel, command, ...data) {
	const bytes = [command | channel].concat(data);
	keyboard.parseAndDispatch(bytes);
}

function initialize() {
	const channel1 = new Synth.Channel(system);
	const channel2 = new Synth.Channel(system);
	channel2.connect(channel1);

	function initializeInput() {
		const inputName = MusicInput.ports.value;
		if (inputName !== '') {
			inputPort = MusicInput.port(inputName);
			inputPort.addEventListener('synthinput', processInput);
			inputPort.toChannel[0] = channels.length - 1;
			inputPort.legato[0] = false;
		}
	}

	MusicInput.open().then(initializeInput);
	keyboard.addEventListener('synthinput', processInput);
	keyboard.toChannel[0] = channels.length - 1;
	keyboard.fromChannel[1] = 1;
	keyboard.legato[0] = false;
	keyboard.legato[1] = false;

	const parameterMap = new Map();
	parameterMap.set(Synth.Param.GLIDE, new Synth.Change(Synth.ChangeType.SET, 0));
	parameterMap.set(Synth.Param.FILTER_MIX, new Synth.Change(Synth.ChangeType.SET, 0));
	parameterMap.set(Synth.Param.UNFILTERED_MIX, new Synth.Change(Synth.ChangeType.SET, 100));
	parameterMap.set(Synth.Param.ATTACK_CURVE, new Synth.Change(Synth.ChangeType.SET, 3));
	parameterMap.set(Synth.Param.DELAY, new Synth.Change(Synth.ChangeType.SET, 1));
	channels[0].setParameters(parameterMap);
	channels[1].setParameters(parameterMap);

	sendNewLine();
	setInterval(sendNewLine, BUFFER_LENGTH * 20);

	const piano = new Synth.SampledInstrument('Acoustic Grand Piano');
	system.instruments[0] = piano;
	piano.loadSampleFromURL(audioContext, 0, 'samples/acoustic-grand-piano.wav').catch(resourceError);
	const guitar = new Synth.SampledInstrument('Guitar Strum');
	system.instruments[1] = guitar;
	guitar.loadSampleFromURL(audioContext, 0, 'samples/guitar-strum.wav').catch(resourceError);

	const violin = new Synth.SampledInstrument('Violin');
	system.instruments[2] = violin;
	violin.loadSampleFromURL(audioContext, 0, 'samples/violin.wav').catch(resourceError);
}

function begin() {
	audioContext.resume();
	system.start();
	document.getElementById('intro').style.display = 'none';
	document.getElementById('controls').style.display = 'block';
	const patreonScript = document.createElement('SCRIPT');
	patreonScript.async = true;
	document.getElementById('patreon').appendChild(patreonScript);
	patreonScript.src = 'https://c6.patreon.com/becomePatronButton.bundle.js';
	resizeGraph();
	window.addEventListener('resize', resizeGraph);
}

const emptyMap = new Map();
function sendNewLine() {
	const notesOn = (keyboard.notes[0].length > 0 ||
		(inputPort !== undefined && inputPort.notes[inputChannel].length > 0)
	);
	if (
		notesOn ||
		Math.abs(channels[0].glissandoStepsDone) < Math.abs(channels[0].parameters[Synth.Param.GLISSANDO]) ||
		Math.abs(channels[1].glissandoStepsDone) < Math.abs(channels[1].parameters[Synth.Param.GLISSANDO])
	) {
		const now = system.nextStep();
		let nextLine = Math.max(now, system.nextLine);
		const bufferUntil = now + BUFFER_LENGTH;
		while (nextLine <= bufferUntil) {
			channels[0].setParameters(emptyMap, nextLine, true);
			channels[1].setParameters(emptyMap, nextLine, true);
			const newNextLine = system.nextLine;
			if (newNextLine > nextLine) {
				nextLine = newNextLine;
			} else{
				break;
			}
		}
	}
}

function playNote() {
	const note = parseInt(document.getElementById('note').value);
	const gate = keyboard.gate[0];
	keyboard.gate[0] = Synth.Gate.LEGATO_TRIGGER;
	keyboard.noteOn(0, note);
	sendNewLine();
	keyboard.noteOff(0, note);
	keyboard.gate[0] = gate;
}

function openGateTemporarily() {
	if ((channels[0].parameters[Synth.Param.GATE] & Synth.Gate.TRIGGER) !== Synth.Gate.OPEN) {
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

function resourceError(error) {
	console.error(error.source + ': ' + error.message);
}

function addInstrumentToList(instrument) {
	return function (resource) {
		const instrumentNumber = system.instruments.length;
		system.instruments[instrumentNumber] = instrument;
		const dropDown = document.getElementById('sample-list');
		const option = document.createElement('option');
		option.value = instrumentNumber + 1;
		option.innerText = instrument.name;
		dropDown.appendChild(option);
	};
}

function uploadSamples() {
	const files = document.getElementById('sample-upload').files;
	for (let i = 0; i < files.length; i++) {
		const name = files[i].name.replace(/\.\w*$/, '')
		const instrument = new Synth.SampledInstrument(name);
		instrument.loadSampleFromFile(audioContext, 0, files[i])
		.then(addInstrumentToList(instrument));
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
	numRecordings++;
	const name = 'Recording ' + numRecordings;
	const instrument = new Synth.SampledInstrument(name);
	const sample = new Synth.Sample(buffer);
	instrument.addSample(0, sample);
	const instrumentNumber = system.instruments.length;
	system.instruments[instrumentNumber] = instrument;
	const dropDown = document.getElementById('sample-list');
	const option = document.createElement('option');
	option.value = instrumentNumber + 1;
	option.innerText = name;
	dropDown.appendChild(option);
}

document.getElementById('sampler-btn').addEventListener('click', function (event) {
	if (Sampler.recording) {
		Sampler.stopRecording();
		event.currentTarget.children[0].src = 'img/record.png';
	} else {
		Sampler.requestAccess().then(function () {
			Sampler.startRecording();
			document.getElementById('sampler-btn').children[0].src = 'img/stop.png';
		});
	}
});

let graphPointsX = [0, 15, 17, 31];
let graphPointsY = [-1, 0.125, -0.125, 1];

function updateGraphedSound() {
	if (channels !== undefined) {
		const parameterMap = new Map();
		parameterMap.set(Synth.Param.WAVE_X, new Synth.Change(Synth.ChangeType.SET, graphPointsX));
		parameterMap.set(Synth.Param.WAVE_Y, new Synth.Change(Synth.ChangeType.SET, graphPointsY));
		channels[0].setParameters(parameterMap);
		channels[1].setParameters(parameterMap);
	}
}

const canvas = document.getElementById('graph-canvas');
const context2d = canvas.getContext('2d');
const graphMarkSize = 7;
const graphRowColors = ['#e8e8e8', '#d0d0d0'];
let graphWidth, graphHeight, graphMidY;
let graphUnitX, graphGridHeight, graphSnapY = true;
let graphMouseX, graphMouseY, graphChangeX, graphChangeY;

function drawGraph() {
	context2d.clearRect(-1 - graphMarkSize / 2, -1 - graphMarkSize / 2, canvas.width + 2, canvas.height + 2);
	const rowHeight = graphHeight / graphGridHeight;
	let colorIndex = 0;
	for (let y = -rowHeight / 2; y < graphHeight; y = y + rowHeight) {
		context2d.fillStyle = graphRowColors[colorIndex];
		context2d.fillRect(0, y, graphWidth, rowHeight);
		colorIndex = (colorIndex + 1) % 2;
	}

	context2d.beginPath();
	context2d.moveTo(0, graphMidY);
	context2d.lineTo(graphWidth, graphMidY);
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

	context2d.fillStyle = 'black';
	for (let i = 0; i < numValues; i++) {
		const x = Math.round(graphPointsX[i] * graphUnitX);
		const y = Math.round(graphMidY - graphPointsY[i] * graphMidY);
		context2d.fillRect(x - graphMarkSize / 2, y - graphMarkSize / 2, graphMarkSize, graphMarkSize);
	}
	if (graphMouseX !== undefined) {
		context2d.fillStyle = 'red';
		context2d.fillRect(graphMouseX * graphUnitX - graphMarkSize / 2, graphMidY - graphMouseY * graphMidY - graphMarkSize / 2, graphMarkSize, graphMarkSize);
	}
}

function resizeGraph() {
	const canvasWidth = canvas.clientWidth;
	canvas.width = canvasWidth;
	const numValues = graphPointsX.length;
	const maxX = graphPointsX[numValues - 1];
	graphWidth = Math.min(
		Math.max(
			Math.trunc((canvasWidth - graphMarkSize) * maxX) / maxX,
			graphMarkSize * maxX
		),
		(graphMarkSize + 4) * maxX
	);
	graphUnitX = graphWidth / maxX;

	graphHeight = canvas.height - graphMarkSize;
	graphGridHeight = document.getElementById('graph-grid-y').value;
	if (graphGridHeight <= 16) {
		graphHeight = Math.ceil(150 / graphGridHeight) * graphGridHeight;
	} else {
		graphHeight = (graphMarkSize + 2) * graphGridHeight;
	}
	const canvasHeight = graphHeight + graphMarkSize;
	canvas.height = canvasHeight;
	canvas.style.height = canvasHeight + 'px';
	graphMidY = graphHeight / 2;

	context2d.setTransform(1, 0, 0, 1, graphMarkSize / 2,  graphMarkSize / 2);
	requestAnimationFrame(drawGraph);
}

function resampleGraphPoints() {
	const numValues = graphPointsX.length;
	const currentSize = graphPointsX[numValues - 1] + 1;
	const textbox = document.getElementById('graph-width');
	let newSize = parseInt(textbox.value);
	const maxSize = Math.trunc((canvas.width - graphMarkSize) / graphMarkSize);
	if (newSize > maxSize) {
		newSize = maxSize;
		textbox.value = newSize;
	}
	if (newSize === currentSize) {
		return;
	}

	const multiplier = (newSize - 1) / (currentSize- 1);
	const newX = [0];
	const newY = [graphPointsY[0]];
	let prevX = 0;
	for (let i = 1; i < numValues - 1; i++) {
		let x = Math.round(graphPointsX[i] * multiplier);
		let y = graphPointsY[i];
		if (x === prevX) {
			x++;
		}
		if (x >= newSize - 1) {
			if (x === prevX + 1) {
				let midValue = (newY[i - 1] + y) / 2;
				if (graphSnapY) {
					const halfGridHeight = graphGridHeight / 2;
					midValue = Math.round(midValue * halfGridHeight) / halfGridHeight;
				}
				newY[i - 1] = midValue;
				break;
			} else {
				x--;
			}
		}
		newX[i] = x;
		newY[i] = y;
		prevX = x;
	}
	newX.push(newSize - 1);
	newY.push(graphPointsY[numValues - 1]);
	graphPointsX = newX;
	graphPointsY = newY;
	resizeGraph();
}

function setGraphSize() {
	const numValues = graphPointsX.length;
	const currentSize = graphPointsX[numValues - 1] + 1;
	const textbox = document.getElementById('graph-width');
	let newSize = parseInt(textbox.value);
	const maxSize = Math.trunc((canvas.width - graphMarkSize) / graphMarkSize);
	if (newSize < 2) {
		newSize = 2;
		textbox.value = '2';
	} else if (newSize > maxSize) {
		newSize = maxSize;
		textbox.value = newSize;
	}
	if (newSize === currentSize) {
		return;
	} else if (newSize > currentSize) {
		graphPointsX.push(newSize - 1);
		graphPointsY.push(graphPointsY[numValues - 1]);
	} else {
		let before = graphPointsX[numValues - 2];
		let i = numValues - 2;
		while (before >= newSize) {
			i--;
			before = graphPointsX[i];
		}
		const after = graphPointsX[i + 1];
		const beforeValue = graphPointsY[i];
		const afterValue = graphPointsY[i + 1];
		const newX = graphPointsX.slice(0, i + 1);
		const newY = graphPointsY.slice(0, i + 1);
		let finalY = beforeValue + (newSize - 1 - before) * (afterValue - beforeValue) / (after - before);
		if (graphSnapY) {
			const halfGridHeight = graphGridHeight / 2;
			finalY = Math.round(finalY * halfGridHeight) / halfGridHeight;
		}
		newX.push(newSize - 1);
		newY.push(finalY);
		graphPointsX = newX;
		graphPointsY = newY;
	}
	updateGraphedSound();
	resizeGraph();
}

function snapGraph(snap, force) {
	graphSnapY = snap;
	if (snap && (graphGridHeight >= 8 || force)) {
		const numValues = graphPointsX.length;
		const halfGridHeight = graphGridHeight / 2;
		for (let i = 0; i < numValues; i++) {
			let newValue = Math.round(graphPointsY[i] * halfGridHeight) / halfGridHeight;
			if (newValue > 1) {
				newValue = 1;
			} else if (newValue < -1) {
				newValue = -1;
			}
			graphPointsY[i] = newValue;
		}
		updateGraphedSound();
		requestAnimationFrame(drawGraph);
	}
}

function resetGraphData() {
	graphPointsX = [0, graphPointsX[graphPointsX.length - 1]];
	graphPointsY = [-1, 1];
	updateGraphedSound();
	requestAnimationFrame(drawGraph);
}

canvas.addEventListener('mousemove', function (event) {
	const numValues = graphPointsX.length;
	const maxX = graphPointsX[numValues - 1];
	let x = Math.round((event.offsetX - graphMarkSize / 2) / graphUnitX);
	let outOfRange = false;
	if (x < 0) {
		x = 0;
		outOfRange = true;
	} else if (x > maxX) {
		x = maxX;
		outOfRange = true;
	}

	const halfGridHeight = graphGridHeight / 2;
	let y = 1 - Math.round(event.offsetY - graphMarkSize / 2) / graphMidY;
	let roundedY, displayY;
	if (y < -1) {
		y = -1;
		roundedY = -halfGridHeight;
		displayY = roundedY;
		outOfRange = true;
	} else if (y > 1) {
		y = 1;
		roundedY = halfGridHeight;
		displayY = roundedY;
		outOfRange = true;
	} else {
		roundedY = Math.round(y * halfGridHeight);
		if (graphSnapY) {
			y = roundedY / halfGridHeight;
			displayY = roundedY;
		} else {
			displayY = Math.round(y * halfGridHeight * 10) / 10;
		}
	}

	if (x != graphMouseX || y !== graphMouseY) {
		if (graphChangeX !== undefined) {
			let index = graphPointsX.indexOf(graphChangeX);
			if (graphChangeX === 0 && x > 0) {
				if (graphPointsX[1] > 1 && graphChangeY === roundedY) {
					graphPointsX.splice(1, 0, 1);
					graphPointsY.splice(1, 0, y);
					graphChangeX = 1;
					x = 1;
					index = 1;
				} else {
					x = 0;
				}
			} else if (graphChangeX === maxX && x < maxX) {
				if (graphPointsX[numValues - 2] < maxX - 1 && graphChangeY === roundedY) {
					graphPointsX.splice(numValues - 1, 0, maxX - 1);
					graphPointsY.splice(numValues - 1, 0, y);
					graphChangeX = maxX - 1;
					x = graphChangeX;
					index = numValues - 1;
				} else {
					x = maxX;
				}
			} else {
				if (x > graphPointsX[index - 1] && x < graphPointsX[index + 1]) {
					graphPointsX[index] = x;
					graphChangeX = x;
				} else {
					x = graphChangeX;
				}
			}
			graphPointsY[index] = y;
			updateGraphedSound();
		}

		if (x != graphMouseX || y !== graphMouseY) {
			if (outOfRange && graphChangeX === undefined) {
				graphMouseX = undefined;
				document.getElementById('mouse-coords').innerHTML = '&nbsp;';
			} else {
				graphMouseX = x;
				graphMouseY = y;
				document.getElementById('mouse-coords').innerHTML = 'x: ' + x + ', y: ' + displayY;
			}
			requestAnimationFrame(drawGraph);
			if (graphChangeY !== roundedY) {
				graphChangeY = undefined;
			}
		}
	}
});

canvas.addEventListener('mouseleave', function (event) {
	graphMouseX = undefined;
	graphChangeX = undefined;
	requestAnimationFrame(drawGraph);
	document.getElementById('mouse-coords').innerHTML = '&nbsp;';
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
	const halfGridHeight = graphGridHeight / 2;
	graphChangeY = Math.round((1 - Math.round(event.offsetY - graphMarkSize / 2) / graphMidY) * halfGridHeight);
});

canvas.addEventListener('mouseup', function (event) {
	graphChangeX = undefined;
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
	graphMouseX = undefined;
});
