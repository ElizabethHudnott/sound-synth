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

class Midi extends EventTarget {

	constructor(name, port) {
		super();
		this.name = name;
		this.port = port;

		/* Map each MIDI channel to one or more synth channels.
		 * If fromChannel[i] === undefined then the channel doesn't raise events.
		 */
		const fromChannel = new Array(16);
		const toChannel = new Array(16);
		this.fromChannel = fromChannel;
		this.toChannel = toChannel;
		fromChannel[0] = 0;

		/* The notes being recorded on each MIDI channel in ascending pitch order if an
		 * arpeggio is being played, or from first down to last down if not...
		 */
		this.notes = [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []];

		/* ... and the synth channels that each of those MIDI notes is being played on,
		 * or undefined if the note's not currently being played because of lack of an
		 * available channel.
		 */
		this.notesToChannels = [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []];

		/* For each MIDI channel, whether holding down multiple notes creates an arpeggio
		 * or if a last down priority is used.
		 */
		this.arpeggio = new Array(16);
		this.arpeggio.fill(false);

		// The gating option used to trigger new notes sent by each MIDI channel.
		this.gate = new Array(16);
		this.gate.fill(Synth.Gate.OPEN);
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

	parseMIDI(bytes) {
		const parameterMap = new Map();
		const command = bytes[0] & 0xf0;
		const midiChannel = bytes[0] & 0x0f;
		const fromChannel = this.fromChannel[midiChannel];
		let toChannel = this.toChannel[midiChannel];

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
					const notes = this.notes[midiChannel];
					if (this.arpeggio[midiChannel]) {
						synthChannel = fromChannel;
						let noteIndex = notes.length;
						while (noteIndex > 0 && notes[noteIndex - 1] < note) {
							noteIndex--;
						}
						if (noteIndex === 0 || note !== notes[noteIndex - 1]) {
							notes.splice(noteIndex, 0, note);
							this.notesToChannels[midiChannel].splice(noteIndex, 0, synthChannel);
							parameterMap.set(Synth.Param.NOTES, new Synth.Change(Synth.ChangeType.SET, notes.slice()));
						}
					} else {
						const numChannels = toChannel - fromChannel + 1;
						const synthChannels = this.notesToChannels[midiChannel];
						let noteIndex = notes.indexOf(note);
						synthChannel = undefined;
						if (noteIndex !== -1) {
							// Check if note is already on.
							synthChannel = synthChannels[noteIndex];
							notes.splice(noteIndex, 1);
							synthChannels.splice(noteIndex, 1);
						}
						if (synthChannel === undefined) {
							if (notes.length < numChannels) {
								// Find a free channel.
								for (let i = fromChannel; i <= toChannel; i++) {
									if (!synthChannels.includes(i)) {
										synthChannel = i;
										break;
									}
								}
							} else {
								// Mute an existing note.
								for (let i = fromChannel; i <= toChannel; i++) {
									const channel = synthChannels[i];
									if (channel !== undefined) {
										synthChannel = i;
										synthChannels[i] = undefined;
										break;
									}
								}
							}
							parameterMap.set(Synth.Param.NOTES, new Synth.Change(Synth.ChangeType.SET, [note]));
						}
						notes.push(note);
						synthChannels.push(synthChannel);
					}

					parameterMap.set(Synth.Param.VELOCITY, new Synth.Change(Synth.ChangeType.SET, velocity));
					const gate = this.gate[midiChannel];
					parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, gate));
					break;
				} // else fall through if velocity == 0
			}

			case 0x80: { // Note off
				const note = bytes[1];
				const notes = this.notes[midiChannel];
				const noteIndex = notes.indexOf(note);
				if (noteIndex !== -1) {
					const synthChannels = this.notesToChannels[midiChannel];
					synthChannel = synthChannels[noteIndex];
					const numNotes = notes.length;
					notes.splice(noteIndex, 1);
					synthChannels.splice(noteIndex, 1);

					if (this.arpeggio[midiChannel]) {
						if (numNotes === 1) {
							parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, Synth.Gate.CLOSED));
							if (fromChannel !== synthChannel) {
								return [[fromChannel, synthChannel], parameterMap];
							}
						} else if (synthChannel !== fromChannel) {
							parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, Synth.Gate.CLOSED));
						} else {
							parameterMap.set(Synth.Param.NOTES, new Synth.Change(Synth.ChangeType.SET, notes.slice()));
						}
					} else {
						const numChannels = toChannel - fromChannel + 1;
						if (numNotes > numChannels) {
							let revivedIndex = numNotes - 2;
							while (synthChannels[revivedIndex] !== undefined) {
								revivedIndex--;
							}
							const revivedNote = notes[revivedIndex];
							parameterMap.set(Synth.Param.NOTES, new Synth.Change(Synth.ChangeType.SET, [revivedNote]));
							synthChannels[revivedIndex] = synthChannel;
						} else {
							parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, Synth.Gate.CLOSED));
						}
					}
				}
				break;
			}

			case 0xb0: {
				if (bytes[1] === 120) { // All sound off
					parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, Synth.Gate.CUT));
					const synthChannels = this.notesToChannels[midiChannel];
					const activeChannels = [];
					for (let i = 0; i < synthChannels.length; i++) {
						const channel = synthChannels[i];
						if (channel !== undefined) {
							activeChannels.push(channel);
						}
					}
					this.notes[midiChannel] = [];
					this.notesToChannels[midiChannel] = [];
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

	open() {
		const port = this.port;
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
		const port = this.port;
		if (port !== undefined) {
			const me = this;
			port.onmidimessage = null;
			return port.close().then(function (port) {
				return me;
			});
		}
	}

}

// Maps IDs to lazily created 'MIDI objects'.
const midiObjects = new Map();
const select = document.createElement('select');
select.id = 'midi-port';

function addPort(id, name) {
	const option = document.createElement('option');
	option.value = id;
	option.innerText = name;
	select.appendChild(option);
}

function removePort(id) {
	select.querySelector(`option[value="${id}"]`).remove();
	midiObjects.remove(id);
}

if (window.parent !== window || window.opener !== null) {
	const webLink = new Midi('WebMidiLink');
	midiObjects.set('WebMidiLink', webLink);
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
				console.warn('Invalid Web MIDI Link message received: ' + event.data);
				return;
			}
			bytes.push(value);
		}
		webLink.parseAndDispatch(bytes, performance.now());
	}

	window.addEventListener("message", webMIDILinkReceive);

	webLink.open = function () {
		window.addEventListener("message", webMIDILinkReceive);
		return Promise.resolve(webLink);
	}

	webLink.close = function () {
		window.removeEventListener("message", webMIDILinkReceive);
		return Promise.resolve(webLink);
	}
}

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
	if (access !== undefined) {
		access.onstatechange = null;
		for (let [id, port] of access.inputs) {
			port.onmidimessage = null;
			port.close();
			removePort(id);
		}
		access = undefined;
	}
}

function port(id) {
	let midiObject = midiObjects.get(id);

	if (midiObject !== undefined) {
		return midiObject;
	}

	if (access === undefined) {
		return undefined;
	}

	const midiPort = access.inputs.get(id);
	if (midiPort === undefined) {
		return undefined;
	}

	midiObject = new Midi(midiPort.name, midiPort);
	midiObjects.set(id, midiObject);
	return midiObject;
}

global.Midi = {
	Midi: Midi,
	SynthInputEvent: SynthInputEvent,
	open: open,
	close: close,
	port: port,
	ports: select,
};

})(window);
