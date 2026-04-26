import type { Context } from 'koishi'
import { Schema } from 'koishi'

export const name = 'pipe'

export interface Config {
  separator: string
}

export const Config: Schema<Config> = Schema.object({
  separator: Schema.string().default(' | '),
})

export function apply(ctx: Context, config: Config) {
  ctx.middleware((session, next) => {
    if (!session.content || !session.content.includes(config.separator))
      return next()
    const reduced = session.content.split(config.separator)
      .reduceRight((acc, cur) => `${acc} $(${cur})`)
    session.execute(reduced)
  }, true)
}
