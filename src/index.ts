import type { Context } from 'koishi'
import { Logger, Schema } from 'koishi'

export const name = 'pipe'
const logger = new Logger(name)

export interface Config {
  separator: string
  debug: boolean
  indent: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    separator: Schema.string().default(' | '),
  }),
  Schema.object({
    debug: Schema.boolean().default(true).description('开启调试模式。'),
    indent: Schema.string().default('\t').description('调试模式下的缩进。'),
  }).description('高级设置'),
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
    // if (!config.debug)
    //   return _resolvePipe(content)
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
