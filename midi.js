(function (global) {
'use strict';

class SynthInputEvent extends Event {
	constructor(synthChannel, changes) {
		super('synthinput');
		this.synthChannel = synthChannel;
		this.changes = changes;
	}
}

class Midi extends EventTarget {

	constructor() {
		super();

		// Map each MIDI channel to one or more synth channels.
		const fromChannel = new Array(16);
		const toChannel = new Array(16);
		this.fromChannel = fromChannel;
		this.toChannel = toChannel;
		for (let i = 0; i < 16; i++) {
			fromChannel[i] = i;
			toChannel[i] = i;
		}

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

	parseMIDI(bytes) {
		const parameterMap = new Map();
		const command = bytes[0] & 0xf0;
		const midiChannel = bytes[0] & 0x0f;
		let synthChannel = 0;

		switch (command) {

			case 0x90: { // Note on
				const velocity = bytes[2];

				if (velocity > 0) {
					const note = bytes[1];
					if (this.arpeggio[midiChannel]) {
						synthChannel = this.fromChannel[midiChannel];
						const notes = this.notes[midiChannel];
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

					}

					parameterMap.set(Synth.Param.VELOCITY, new Synth.Change(Synth.ChangeType.SET, velocity));
					const gate = this.midiGates[midiChannel];
					parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, gate));
					break;
				}
			}

			case 0x80: { // Note off
				const note = bytes[1];
				if (this.arpeggio[midiChannel]) {
					const notes = this.notes[midiChannel];
					const noteIndex = notes.indexOf(note);
					if (noteIndex !== -1) {
						synthChannel = this.fromChannel[midiChannel];
						notes.splice(noteIndex, 1);
						this.notesToChannels[midiChannel].splice(noteIndex, 1);
						if (notes.length === 0) {
							parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, Synth.Gate.CLOSED));
						} else {
							parameterMap.set(Synth.Param.NOTES, new Synth.Change(Synth.ChangeType.SET, notes.slice()));
						}
					}
				} else {

				}
				break;
			}

			case 0xb0: // All sound off
				break;
		}

		return [synthChannel, parameterMap];
	}

	parseAndDispatch(bytes) {
		const [synthChannel, parameterMap] = this.parseMIDI(bytes);
		const event = new SynthInputEvent(synthChannel, parameterMap);
		this.dispatchEvent(event);
	}

}

const webLink = new Midi();

function webMIDILinkReceive(event) {
	const message = event.data.split(',');
	if (message[0] !== 'midi') {
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

global.Midi = {
	SynthInputEvent: SynthInputEvent,
	webLink: webLink,
};

})(window);
