import type { Context, Session } from 'koishi'
import { Argv, h, Schema } from 'koishi'

export const name = 'pipe'

export interface Config {
  pipe: boolean
  xargs: boolean
  separator: string
  arguments: string
  echo: string
  indent: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    pipe: Schema.boolean().default(true).description('启用管道。'),
    xargs: Schema.boolean().default(true).description('启用 xargs 函数。'),
    separator: Schema.string().default(' | ').description('管道分隔符。'),
    arguments: Schema.string().default(' -- ').description('参数分隔符。'),
    echo: Schema.string().default('echo').description('默认命令。'),
    indent: Schema.string().default('\t').description('缩进字符。'),
  }),
])

export function apply(ctx: Context, config: Config) {
  async function resolvePipe(session: Session) {
    return session.content!.split(config.separator)
      .map(item => Promise.resolve([h.text(item)]))
      .reduce(async (previous, current) => {
        const { tokens = [] } = Argv.parse((await current).join(''))
        const name = tokens?.shift()?.content
        const command = ctx.$commander.get(name || config.echo, session)
        if (!command)
          return await session?.send(`${name}: 未找到指令。`) && []
        if (tokens.length)
          tokens[tokens.length - 1].terminator = config.arguments
        tokens.push(...(await previous).map((content, index, array) => ({
          content: String(content),
          quoted: true,
          terminator: index === array.length - 1 ? '' : ' ',
          inters: [],
        })))
        return session.execute(command.parse({ tokens }), true)
      }, Promise.resolve([]))
  }

  config.pipe && ctx.middleware(async (session, next) => {
    if (!session.content || !session.content.includes(config.separator))
      return next()
    return await resolvePipe(session)
  }, true)

  config.xargs && ctx.command('xargs <message:text>', '转发指令参数。')
    .option('count', '-n <count:number> 最大执行字段数。')
    .action(({ session, options }, message) => {
      if (!session)
        return
      const [commands, args] = message.split(config.arguments)
      const [name, ...baseArgs] = Argv.parse(commands).tokens || []
      baseArgs[baseArgs.length - 1].terminator = config.arguments
      const command = ctx.$commander.get(name.content, session)
      const tokens = Argv.parse(args).tokens || []
      const chunks: (typeof tokens)[] = []
      while (tokens.length)
        chunks.push(tokens.splice(0, options?.count || tokens.length))
      const promises = chunks.map(async (chunk) => {
        const argv = command.parse({ tokens: [...baseArgs, ...chunk] })
        return (await session.execute(argv, true)).join(' ')
      }, true)
      return Promise.all(promises).then(lines => lines.join('\n'))
    })
}
