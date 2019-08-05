(function (global) {
'use strict';

class SynthInputEvent extends Event {
	constructor(channels, changes, timestamp) {
		super('synthinput');
		this.channels = channels;
		this.changes = changes;
		this.timestamp = timestamp;
	}
}

class Input extends EventTarget {

	constructor(name, midiPortOrChCount) {
		super();
		this.name = name;
		let numberOfChannels;
		if (midiPortOrChCount <= 16) {
			numberOfChannels = midiPortOrChCount;
			this.midiPort = undefined;
		} else {
			numberOfChannels = 16;
			this.midiPort = midiPortOrChCount;
		}

		/* Map each input channel to one or more synth channels.
		 * If fromChannel[i] === undefined then the channel doesn't raise events.
		 */
		const fromChannel = new Array(numberOfChannels);
		const toChannel = new Array(numberOfChannels);
		this.fromChannel = fromChannel;
		this.toChannel = toChannel;
		fromChannel[0] = 0;

		/* The notes being recorded on each input channel in ascending pitch order if an
		 * arpeggio is being played, or from first down to last down if not...
		 */
		this.notes = new Array(numberOfChannels);
		for (let i = 0; i < numberOfChannels; i++) {
			this.notes[i] = [];
		}

		/* ... and the synth channels that each of those notes is being played on,
		 * or undefined if the note's not currently being played because of lack of an
		 * available channel.
		 */
		this.notesToChannels = new Array(numberOfChannels);
		for (let i = 0; i < numberOfChannels; i++) {
			this.notesToChannels[i] = [];
		}

		/* For each input channel, whether holding down multiple notes creates an arpeggio
		 * or if a last down priority is used.
		 */
		this.arpeggio = new Array(numberOfChannels);
		this.arpeggio.fill(false);

		this.chord = new Array(numberOfChannels);
		for (let i = 0; i < numberOfChannels; i++) {
			this.chord[i] = [0];
		}

		// The gating option used to trigger new notes sent by each input channel.
		this.gate = new Array(numberOfChannels);
		this.gate.fill(Synth.Gate.OPEN);
		this.lockedOn = false;

		// For each input channel, whether or not to retrigger revived notes.
		this.retrigger = new Array(numberOfChannels);
		this.retrigger.fill(false);

		/* For each input channel, whether there is glide only when overlapped notes are
		 * revived (true), or glide both when receiving Note On messages and when reviving
		 * notes (false, i.e. mono mode).
		 */
		 this.legato = new Array(numberOfChannels);
		 this.legato.fill(true);

		 /* The change type used to implement glide. SET disables glide. EXPONENTIAL is
		  * a normal glide. LINEAR is alternative glide.
		  */
		 this.glide = new Array(numberOfChannels);
		 this.glide.fill(Synth.ChangeType.EXPONENTIAL);

		 /* A list of the order in which *synth* channels last had their notes released.
		  * The most recently released channel number is at the end of the list.
		  */
		 this.channelQueue = [];
	}

	get numberOfChannels() {
		return this.fromChannel.length;
	}

	enableArpeggio(channel, enabled) {
		if (enabled) {
			const oldNotes = this.notes[channel];
			const newNotes = oldNotes.slice().sort();
			const oldChannels = this.notesToChannels[channel];
			const newChannels = [];
			for (let i = 0; i < newNotes.length; i++) {
				const index = oldNotes.indexOf(newNotes[i]);
				newChannels.push(oldChannels[index]);
			}
			this.notes[channel] = newNotes;
			this.notesToChannels[channel] = newChannels;
		}
		this.arpeggio[channel] = enabled;
	}

	setLockedOn() {
		this.lockedOn = true;
		if (this.notes[0].length === 0) {
			this.noteOn(0, 60);
		}
	}

	parseMIDI(bytes) {
		const parameterMap = new Map();
		const command = bytes[0] & 0xf0;
		const inputChannel = bytes[0] & 0x0f;
		const fromChannel = this.fromChannel[inputChannel];
		let toChannel = this.toChannel[inputChannel];

		if (fromChannel === undefined) {
			return [[], parameterMap];
		}
		if (toChannel === undefined || toChannel < fromChannel) {
			toChannel = fromChannel;
		}

		let synthChannel = 0;

		switch (command) {

			case 0x90: { // Note on
				const velocity = bytes[2];

				if (velocity > 0) {
					const note = bytes[1];
					const notes = this.notes[inputChannel];
					const numNotes = notes.length;

					let changeType;
					if (this.legato[inputChannel]) {
						changeType = Synth.ChangeType.SET;
					} else {
						changeType = this.glide[inputChannel];
					}

					if (this.arpeggio[inputChannel]) {
						synthChannel = fromChannel;
						let noteIndex = numNotes;
						while (noteIndex > 0 && notes[noteIndex - 1] < note) {
							noteIndex--;
						}
						if (noteIndex === 0 || note !== notes[noteIndex - 1]) {
							notes.splice(noteIndex, 0, note);
							this.notesToChannels[inputChannel].splice(noteIndex, 0, synthChannel);
							parameterMap.set(Synth.Param.NOTES, new Synth.Change(changeType, notes.slice()));
						}
					} else {
						const numChannels = toChannel - fromChannel + 1;
						const synthChannels = this.notesToChannels[inputChannel];
						let noteIndex = notes.indexOf(note);
						synthChannel = undefined;
						if (noteIndex !== -1) {
							// Check if note is already on.
							synthChannel = synthChannels[noteIndex];
							notes.splice(noteIndex, 1);
							synthChannels.splice(noteIndex, 1);
						}
						if (synthChannel === undefined) {
							if (numNotes < numChannels) {
								// Find a free channel.
								let minQueuePosition;
								for (let i = fromChannel; i <= toChannel; i++) {
									if (!synthChannels.includes(i))  {
										const queuePosition = this.channelQueue.indexOf(i);
										if (queuePosition === -1) {
											synthChannel = i;
											break;
										} else if (minQueuePosition === undefined || queuePosition < minQueuePosition) {
											minQueuePosition = queuePosition;
										}
									}
								}
								if (synthChannel === undefined) {
									synthChannel = this.channelQueue[minQueuePosition];
								}
							} else {
								// Mute an existing note.
								for (let i = 0; i < numNotes; i++) {
									const channel = synthChannels[i];
									if (channel !== undefined) {
										synthChannel = channel;
										synthChannels[i] = undefined;
										break;
									}
								}
							}
							const chord = calculateChord(this.chord[inputChannel], note);
							parameterMap.set(Synth.Param.NOTES, new Synth.Change(changeType, chord));
						}
						notes.push(note);
						synthChannels.push(synthChannel);
					}

					parameterMap.set(Synth.Param.VELOCITY, new Synth.Change(Synth.ChangeType.SET, velocity));
					const gate = this.lockedOn ? Synth.Gate.REOPEN : this.gate[inputChannel];
					parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, gate));
					break;
				} // else fall through if velocity == 0
			}

			case 0x80: { // Note off
				const note = bytes[1];
				const notes = this.notes[inputChannel];
				const numNotes = notes.length;
				const lockedOn = this.lockedOn;
				if (numNotes === 1 && lockedOn) {
					return [[], parameterMap];
				}
				const noteIndex = notes.indexOf(note);
				if (noteIndex !== -1) {
					const synthChannels = this.notesToChannels[inputChannel];
					synthChannel = synthChannels[noteIndex];
					notes.splice(noteIndex, 1);
					synthChannels.splice(noteIndex, 1);
					const changeType = this.glide[inputChannel];
					let closeGate = false;

					if (this.arpeggio[inputChannel]) {
						if (numNotes === 1) {
							closeGate = true
							if (fromChannel !== synthChannel) {
								return [[fromChannel, synthChannel], parameterMap];
							}
						} else if (synthChannel !== fromChannel) {
							closeGate = true;
						} else {
							parameterMap.set(Synth.Param.NOTES, new Synth.Change(changeType, notes.slice()));
						}
					} else {
						const numChannels = toChannel - fromChannel + 1;
						if (numNotes > numChannels && synthChannel >= fromChannel && synthChannel <= toChannel) {
							let revivedIndex = numNotes - 2;
							while (synthChannels[revivedIndex] !== undefined) {
								revivedIndex--;
							}
							const revivedNote = notes[revivedIndex];
							const chord = calculateChord(this.chord[inputChannel], revivedNote);
							parameterMap.set(Synth.Param.NOTES, new Synth.Change(changeType, chord));
							synthChannels[revivedIndex] = synthChannel;
							if (this.retrigger[inputChannel]) {
								const gate = this.gate[inputChannel];
								parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, gate));
							}
						} else {
							const channelQueue = this.channelQueue;
							const queuePosition = channelQueue.indexOf(synthChannel);
							if (queuePosition === -1) {
								channelQueue.push(synthChannel);
							} else {
								channelQueue.copyWithin(queuePosition, queuePosition + 1);
								channelQueue[channelQueue.length - 1] = synthChannel;
							}
							closeGate = true;
						}
					}
					if (closeGate &&
						(lockedOn || (this.gate[inputChannel] & Synth.Gate.TRIGGER) !== Synth.Gate.TRIGGER)
					) {
						parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, Synth.Gate.CLOSED));
					}
				}
				break;
			}

			case 0xb0: {
				if (bytes[1] === 120) { // All sound off
					this.lockedOn = false;
					parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, Synth.Gate.CUT));
					const synthChannels = this.notesToChannels[inputChannel];
					const activeChannels = [];
					for (let i = 0; i < synthChannels.length; i++) {
						const channel = synthChannels[i];
						if (channel !== undefined) {
							activeChannels.push(channel);
						}
					}
					this.notes[inputChannel] = [];
					this.notesToChannels[inputChannel] = [];
					return [activeChannels, parameterMap];
				}
				break;
			}
		}
		return [[synthChannel], parameterMap];
	}

	parseAndDispatch(bytes, timestamp) {
		const [channels, parameterMap] = this.parseMIDI(bytes);
		if (channels.length > 0) {
			const event = new SynthInputEvent(channels, parameterMap, timestamp);
			this.dispatchEvent(event);
		}
	}

	noteOn(channel, note, velocity) {
		const timestamp = performance.now();
		const bytes = [
			0x90 | channel,
			note,
			velocity === undefined ? 127 : velocity
		];
		this.parseAndDispatch(bytes, timestamp);
	}

	noteOff(channel, note) {
		const timestamp = performance.now();
		const bytes = [
			0x80 | channel,
			note,
			127
		];
		this.parseAndDispatch(bytes, timestamp);
	}

	allSoundOff() {
		const timestamp = performance.now();
		const bytes = [0, 120];
		const numberOfChannels = this.fromChannel.length;
		for (let i = 0; i < numberOfChannels; i++) {
			bytes[0] = 0xb0 | i;
			this.parseAndDispatch(bytes, timestamp); // All notes off
		}
	}

	open() {
		const port = this.midiPort;
		if (port !== undefined) {
			const me = this;
			return port.open().then(function (port) {
				port.onmidimessage = function (event) {
					me.parseAndDispatch(event.data, event.timestamp);
				};
				return me;
			});
		}
	}

	close() {
		const port = this.midiPort;
		let promise;
		if (port !== undefined) {
			port.onmidimessage = null;
			const me = this;
			promise = port.close().then(function (port) {
				return me;
			});
		} else {
			promise = Promise.resolve(this);
		}
		this.allSoundOff();
		return promise;
	}

	get manufacturer() {
		if (this.midiPort === undefined) {
			return null;
		} else {
			return this.midiPort.manufacturer;
		}
	}

	get version() {
		if (this.midiPort === undefined) {
			return null;
		} else {
			return this.midiPort.version;
		}
	}

	addEventListener(type, listener, options) {
		this.open();
		super.addEventListener(type, listener, options);
	}

}

// Maps IDs to lazily created 'input objects'.
const inputs = new Map();
const select = document.createElement('select');
select.id = 'input-port';

function addPort(id, name) {
	const option = document.createElement('option');
	option.value = id;
	option.innerText = name;
	select.appendChild(option);
}

function removePort(id) {
	const element = select.querySelector(`option[value="${id}"]`);
	if (element !== null) {
		element.remove();
		const input = inputs.get(id);
		if (input !== undefined) {
			input.allSoundOff();
			inputs.delete(id);
		}
	}
}

function addCustomPort(id, input) {
	removePort(id);
	addPort(id, input.name);
	inputs.set(id, input);
}

function removeCustomPort(inputToRemove) {
	for (let [id, input] of inputs) {
		if (input === inputToRemove) {
			removePort(id);
			break;
		}
	}
}

if (window.parent !== window || window.opener !== null) {
	const webLink = new Input('WebMidiLink');
	inputs.set('WebMidiLink', webLink);
	addPort('WebMidiLink', 'WebMidiLink');

	function webMIDILinkReceive(event) {
		const message = event.data.split(',');
		if (message[0].toLowerCase() !== 'midi') {
			return;
		}
		const bytes = [];
		const numFields = message.length;
		for (let i = 1; i < numFields; i++) {
			const value = parseInt(message[i], 16);
			if (Number.isNaN(value)) {
				console.warn('Invalid WebMidiLink message received: ' + event.data);
				return;
			}
			bytes.push(value);
		}
		webLink.parseAndDispatch(bytes, performance.now());
	}

	webLink.open = function () {
		window.addEventListener("message", webMIDILinkReceive);
		return Promise.resolve(webLink);
	}

	webLink.close = function () {
		window.removeEventListener("message", webMIDILinkReceive);
		webLink.allSoundOff();
		return Promise.resolve(webLink);
	}
}

const keyboard = new Input('Computer Keyboard');
inputs.set('ComputerKeyboard', keyboard);

let access;

function open() {
	if (navigator.requestMIDIAccess) {
		return navigator.requestMIDIAccess().then(function (midiAccess) {
			access = midiAccess;
			for (let [id, port] of midiAccess.inputs) {
				addPort(id, port.name || id);
			}
			access.onstatechange = function (event) {
				const port = event.port;
				const id = port.id;
				if (port.state === 'connected') {
					addPort(id, port.name || id);
				} else {
					removePort(id);
				}
			};
		});
	} else {
		return Promise.reject(new Error("Browser doesn't support Web MIDI."));
	}
}

function close() {
	for (let input of inputs.values()) {
		input.close();
	}
	if (access !== undefined) {
		access.onstatechange = null;
		for (let id of access.inputs.keys()) {
			removePort(id);
		}
		access = undefined;
	}
}

function port(id) {
	let input = inputs.get(id);

	if (input !== undefined) {
		return input;
	}

	if (access === undefined) {
		return undefined;
	}

	const midiPort = access.inputs.get(id);
	if (midiPort === undefined) {
		return undefined;
	}

	input = new Input(midiPort.name || id, midiPort);
	inputs.set(id, input);
	return input;
}

function calculateChord(pattern, rootNote) {
	const length = pattern.length;
	const result = new Array(length);
	for (let i = 0; i < length; i++) {
		result[i] = rootNote + pattern[i];
	}
	return result;
}

function trapKeyboardEvent(event) {
	if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
		return false;
	}

	const element = document.activeElement;
	if (element === null) return true;
	const tagName = element.tagName;

	if (tagName === 'INPUT') {
		const type = element.type;
		return type === 'button' || type === 'checkbox' || type === 'color' ||
			type === 'file' || type === 'radio' || type === 'range' || type === 'reset';
	} else {
		return tagName !== 'TEXTAREA';
	}
}

window.addEventListener('keydown', function (event) {
	if (!trapKeyboardEvent(event)) {
		return;
	}

	const code = event.code;

	if (code === 'Quote') {
		keyboard.allSoundOff();
		event.preventDefault();
	} else if (code === 'NumpadDivide') {
		MusicInput.keyboardOctave = Math.max(MusicInput.keyboardOctave - 1, 0);
		event.preventDefault();
	} else if (code === 'NumpadMultiply') {
		MusicInput.keyboardOctave = Math.min(MusicInput.keyboardOctave + 1, 7);
		event.preventDefault();
	} else {
		let note = keymap.get(code);
		if (note === undefined) {
			return;
		}
		event.preventDefault();
		note = note + (MusicInput.keyboardOctave - 4) * 12;
		if (note < 0) {
			return;
		}
		if (keyboard.notes[0].includes(note)) {
			return;
		}
		keyboard.noteOn(0, note);
	}
});

window.addEventListener('keyup', function (event) {
	if (!trapKeyboardEvent(event)) {
		return;
	}
	let note = keymap.get(event.code);
	if (note === undefined) {
		return;
	}
	event.preventDefault();
	note = note + (MusicInput.keyboardOctave - 4) * 12;
	if (note < 0) {
		return;
	}
	keyboard.noteOff(0, note);
});


window.addEventListener('blur', function (event) {
	if (typeof(debug) !== 'object' || !debug.input) {
		keyboard.allSoundOff();
	}
});

const keymap = new Map();
keymap.set('IntlBackslash', 47);
keymap.set('KeyZ', 48);
keymap.set('KeyS', 49);
keymap.set('KeyX', 50);
keymap.set('KeyD', 51);
keymap.set('KeyC', 52);
keymap.set('KeyV', 53);
keymap.set('KeyG', 54);
keymap.set('KeyB', 55);
keymap.set('KeyH', 56);
keymap.set('KeyN', 57);
keymap.set('KeyJ', 58);
keymap.set('KeyM', 59);
keymap.set('Comma', 60);
keymap.set('KeyL', 61);
keymap.set('Period', 62);
keymap.set('Semicolon', 63);
keymap.set('Slash', 64);
keymap.set('KeyQ', 60);
keymap.set('Digit2', 61);
keymap.set('KeyW', 62);
keymap.set('Digit3', 63);
keymap.set('KeyE', 64);
keymap.set('KeyR', 65);
keymap.set('Digit5', 66);
keymap.set('KeyT', 67);
keymap.set('Digit6', 68);
keymap.set('KeyY', 69);
keymap.set('Digit7', 70);
keymap.set('KeyU', 71);
keymap.set('KeyI', 72);
keymap.set('Digit9', 73);
keymap.set('KeyO', 74);
keymap.set('Digit0', 75);
keymap.set('KeyP', 76);
keymap.set('BracketLeft', 77);
keymap.set('Equal', 78);
keymap.set('BracketRight', 79);

global.MusicInput = {
	Port: Input,
	SynthInputEvent: SynthInputEvent,
	open: open,
	close: close,
	keyboard: keyboard,
	keyboardOctave: 4,
	port: port,
	ports: select,
	addPort: addCustomPort,
	removePort: removeCustomPort,
	chord: calculateChord,
};

})(window);
