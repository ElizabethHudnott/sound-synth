(function(global) {
'use strict';

class MyMachine extends Machine {
	static Param = Synth.enumFromArray([
		'PARAMETER_NAME',	// Write the parameter's description here.
	]);

	constructor(audioContext) {
		// Call the superclass constructor, passing it initial values for each of the
		// machine's parameters.
		super([
			// Insert the default parameter values here.
		]);

		// Connecting a node to this machine will connect that node to each of these
		// internal destinations.
		this.inputs = [];

		// Connecting this machine to an external destination will connect each of these
		// internal nodes to the external destination.
		this.outputs = [];
	}

	setParameters(changes, time, callbacks) {
		const Parameter = MyMachine.Param;		// Parameter names
		const parameters = this.parameters;		// Parameter values
		const me = this; // For referring to inside callbacks.

		for (let change of changes) {
			if (change.machine !== this) {
				continue;
			}

			const parameterNumber = change.parameterNumber;
			let value = parameters[parameterNumber];

			switch (parameterNumber) {
			case Parameter.PARAMETER_NAME:
				// Implement the parameter change here.
				break;

			case undefined:
				console.error(this.constructor.name + ': An unknown parameter name was used.');
				break;
			}
		}
	}

}

global.Machines.My = MyMachine;

})(window);
