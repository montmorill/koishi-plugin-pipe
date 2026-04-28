import type { Context } from 'koishi'
import { Logger, Schema } from 'koishi'

export const name = 'pipe'
const logger = new Logger(name)

export interface Config {
  separator: string
  debug: boolean
  indent?: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    separator: Schema.string().default(' | '),
  }),
  Schema.intersect([
    Schema.object({
      debug: Schema.boolean().default(false).description('开启调试模式。'),
    }).description('高级设置'),
    Schema.union([
      Schema.object({
        debug: Schema.const(true).required(),
        indent: Schema.string().default('\t').description('调试模式下的缩进。'),
      }),
      Schema.object({}),
    ]),
  ]),
])

export function apply(ctx: Context, config: Config) {
  function _resolvePipe(content: string): string {
    if (content.includes('$')) {
      return content.replaceAll(/\$\(([^()]*)\)/g, (_, match) =>
        `$( ${resolvePipe(match)} )`)
    }
    return content.split(config.separator)
      .reduce((acc, cur) => cur.includes('-')
        ? cur.replace('-', `$( ${cur} )`)
        : `${acc} $( ${cur} )`)
  }

  let depth = 0
  function resolvePipe(content: string): string {
    if (!config.debug || !config.indent)
      return _resolvePipe(content)
    logger.info(`${config.indent.repeat(depth++)}> ${content}`)
    const value = _resolvePipe(content)
    logger.info(`${config.indent.repeat(--depth)}< ${value}`)
    return value
  }

  ctx.middleware((session, next) => {
    if (!session.content || !session.content.includes(config.separator))
      return next()
    session.execute(resolvePipe(session.content))
  }, true)
}
