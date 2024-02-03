import { Regex, SomeCompanionConfigField } from '@companion-module/base'

export interface SoundwebConfig {
	host: string
}

export function getConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Gateway node: IP address',
			width: 8,
			regex: Regex.IP,
			required: true,
		},
	]
}
