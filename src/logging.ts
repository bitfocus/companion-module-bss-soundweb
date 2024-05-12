import {
	CompanionActionContext,
	CompanionActionInfo,
	CompanionFeedbackContext,
	CompanionFeedbackInfo,
} from '@companion-module/base'
import { z } from 'zod'

export async function buttonLocationLogString(
	action: CompanionActionInfo | CompanionFeedbackInfo,
	context: CompanionActionContext | CompanionFeedbackContext
) {
	try {
		// If page returns '$NA', we can assume it is a trigger.  In which case we catch the error and return action.controlId (for now)
		let page = z.coerce.number().parse(await context.parseVariablesInString('$(this:page)'))
		let row = z.coerce.number().parse(await context.parseVariablesInString('$(this:row)'))
		let column = z.coerce.number().parse(await context.parseVariablesInString('$(this:column)'))
		let pageName = await context.parseVariablesInString('$(this:page_name)')

		let pageFormatted = pageName != 'PAGE' ? `${page} (${pageName})` : page
		return `Button:${row}/${column} Page:${pageFormatted}`
	} catch (err) {
		return action.controlId
	}
}
