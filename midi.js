(function (global) {
'use strict';

class SynthInputEvent extends Event {
	constructor(channels, changes) {
		super('synthinput');
		this.channels = channels;
		this.changes = changes;
	}
}

class Midi extends EventTarget {

	constructor(name, manufacturer, version) {
		super();
		this.name = name || null;
		this.manufacturer = manufacturer || null;
		this.version = version || null;

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
		this.midiGates = new Array(16);
		this.midiGates.fill(Synth.Gate.OPEN);
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
					const gate = this.midiGates[midiChannel];
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

	parseAndDispatch(bytes) {
		const [channels, parameterMap] = this.parseMIDI(bytes);
		if (channels.length > 0) {
			const event = new SynthInputEvent(channels, parameterMap);
			this.dispatchEvent(event);
		}
	}

}


const midiObjects = new Map();
const select = document.createElement('select');
select.id = 'midi-port';

function addPortToUI(id, name) {
	const option = document.createElement('option');
	option.value = id;
	option.innerText = name;
	select.appendChild(option);
}

if (window.parent !== window || window.opener !== null) {
	const webLink = new Midi('WebMidiLink', 'g200kg', '0');
	midiObjects.set('WebMidiLink', webLink);
	addPortToUI('WebMidiLink', 'WebMidiLink');

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
		webLink.parseAndDispatch(bytes);
	}

	window.addEventListener("message", webMIDILinkReceive);
}

let access;

function requestAccess() {
	if (navigator.requestMIDIAccess) {
		return navigator.requestMIDIAccess().then(function (midiAccess) {
			access = midiAccess;
			for (let [id, port] of midiAccess.inputs) {
				addPortToUI(id, port.name || id);
			}
		});
	} else {
		return Promise.reject(new Error("Browser doesn't support Web MIDI."));
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

	const name = midiPort.name;
	midiObject = new Midi(name, midiPort.manufacturer, midiPort.version);
	midiObjects.set(id, midiObject);
	return midiObject;
}

global.Midi = {
	Midi: Midi,
	SynthInputEvent: SynthInputEvent,
	port: port,
	ports: select,
	requestAccess: requestAccess,
};

})(window);
