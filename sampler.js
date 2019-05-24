(function (global) {
'use strict';

let deviceIDs = [];
let mediaStream, recorder;

const Sampler = {
	devices: [],
	ondatarecorded: undefined,
	requestAccess: requestAccess,
	startRecording: startRecording,
	stopRecording: stopRecording,
	cancelRecording: cancelRecording,
};

function filterDevices(devices) {
	const deviceNames = [];
	deviceIDs = [];
	for (let i = 0; i < devices.length; i++) {
		const device = devices[i];
		if (device.kind === 'audioinput') {
			deviceNames.push(i + ' ' + device.label);
			deviceIDs.push(device.deviceId);
		}
	}
	Sampler.devices = deviceNames;
}

if (navigator.mediaDevices) {
	navigator.mediaDevices.enumerateDevices().then(filterDevices);
	navigator.mediaDevices.addEventListener('devicechange', function (event) {
		navigator.mediaDevices.enumerateDevices().then(filterDevices);
	});
}

function stopStream() {
	for (let track of mediaStream.getTracks()) {
		track.stop();
	}
	mediaStream = undefined;
}

function dataAvailable(event) {
	recorder = undefined;
	stopStream();
	const reader = new FileReader();
	reader.onloadend = function (event) {
		const arr = event.target.result;
		const arrCopy = arr.slice(0);
		audioContext.decodeAudioData(arr)
		.then(Sampler.ondatarecorded)
		.catch(function (error) {
			Sampler.ondatarecorded(Synth.decodeSampleData(arrCopy));
		});
	};
	reader.readAsArrayBuffer(event.data);
}

function requestAccess(index, constraints) {
	if (constraints === undefined) {
		constraints = {};
	}
	if (index !== undefined) {
		constraints.deviceId = {exact: deviceIDs[i]};
	} else {
		constraints.deviceId = undefined;
	}
	return navigator.mediaDevices.getUserMedia({audio : constraints})
	.then(function (stream) {
		mediaStream = stream;
		recorder = new MediaRecorder(stream);
		recorder.ondataavailable = dataAvailable;
		navigator.mediaDevices.enumerateDevices().then(filterDevices);
	});
}

function startRecording() {
	recorder.start();
}

function stopRecording() {
	recorder.stop();
}

function cancelRecording() {
	recorder.ondataavailable = undefined;
	recorder.stop();
	recorder = undefined;
	stopStream();
}

global.Sampler = Sampler;

})(window);
