import type { Context } from 'koishi'
import { Logger, Schema } from 'koishi'

export const name = 'pipe'
const logger = new Logger(name)

export interface Config {
  separator: string
  indent: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    separator: Schema.string().default(' | ').description('管道分隔符。'),
    indent: Schema.string().default('\t').description('缩进字符。'),
  }),
])

export function apply(ctx: Context, config: Config) {
  function _resolvePipe(content: string): string {
    if (content.includes('$')) {
      return content.replaceAll(/\$\(([^()]*)\)/g, (_, match) =>
        `$( ${resolvePipe(match)} )`)
    }
    return content.split(config.separator)
      .reduce((acc, cur) => `${cur} $( ${acc} )`)
  }

  let depth = 0
  function resolvePipe(content: string): string {
    logger.debug(`${config.indent.repeat(depth++)}> ${content}`)
    const value = _resolvePipe(content)
    logger.debug(`${config.indent.repeat(--depth)}< ${value}`)
    return value
  }

  ctx.middleware((session, next) => {
    if (!session.content || !session.content.includes(config.separator))
      return next()
    return session.execute(resolvePipe(session.elements
      ?.filter(element => element.type === 'text')
      .join('') || ''))
  }, true)

  ctx.command('xargs <message:text>')
    .action(({ session }, message) => session?.execute(message, true))
}
