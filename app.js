const BUFFER_LENGTH = 5;
const audioContext = new AudioContext();
const system = new Synth.System(audioContext);
let gateTemporarilyOpen = false;
let octaveOffset = 0;
let channels, timer;

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

function initialize() {
	audioContext.resume();
	let channel1 = new Synth.SubtractiveSynthChannel(system, true);
	let channel2 = new Synth.SubtractiveSynthChannel(system, true);
	channel2.connect(channel1);
	channels = [channel1, channel2];
	system.start();

	const parameterMap = new Map();
	parameterMap.set(Synth.Param.FILTER_MIX, new Synth.Change(Synth.ChangeType.SET, 0));
	parameterMap.set(Synth.Param.UNFILTERED_MIX, new Synth.Change(Synth.ChangeType.SET, 100));
	parameterMap.set(Synth.Param.ATTACK_CURVE, new Synth.Change(Synth.ChangeType.SET, 3));
	parameterMap.set(Synth.Param.DELAY, new Synth.Change(Synth.ChangeType.SET, 1));
	channels[0].setParameters(parameterMap);

	sendNewLine();
	timer = setInterval(sendNewLine, BUFFER_LENGTH * 20);

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
	if (event.repeat || event.shiftKey || event.altKey || event.ctrlKey ||
		document.activeElement.type === 'text'
	) {
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
