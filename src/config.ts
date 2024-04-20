import { Regex, SomeCompanionConfigField } from '@companion-module/base'

export interface SoundwebConfig {
	host: string
}

export function getConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Gateway Node IP address',
			width: 4,
			regex: Regex.IP,
			required: true,
		},
		{
			type: 'static-text',
			id: 'gatewayNodeHelpText',
			label: '',
			value:
				"This is the IP address of a single device (node) within your Soundweb deployment which can behave as a 'gateway' for Companion to communicate with all the devices in your Audio/London Architect design.",
			width: 8,
		},
	]
}
