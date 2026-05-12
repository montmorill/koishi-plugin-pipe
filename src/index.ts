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
      .map(item => Promise.resolve(item ? [h.text(item)] : []))
      .reduce(async (previous, current) => {
        const argv = Argv.parse((await current).join(' '))
        argv.session = session
        argv.tokens ??= []
        const name = argv.tokens?.shift()?.content || config.echo
        const command = ctx.$commander.get(name, session)
        if (!command)
          return await session?.send(`${name}: 未找到指令。`) && []
        if (argv.tokens.length) {
          argv.tokens[argv.tokens.length - 1].terminator
            = command.name === 'xargs' ? config.arguments : ' '
        }
        argv.tokens.push(...(await previous).map((content, index, array) => ({
          content: String(content),
          quoted: true,
          terminator: index === array.length - 1 ? '' : ' ',
          inters: [],
        })))
        return session.execute(command.parse(argv), true)
      }, Promise.resolve([]))
  }

  config.pipe && ctx.middleware(async (session, next) => {
    if (!session.content || !session.content.includes(config.separator))
      return next()
    return await resolvePipe(session)
  }, true)

  config.xargs && ctx.command('xargs <command:text> -- <arguments:text>', '转发指令参数。')
    .option('count', '-n <count:number> 最大执行字段数。')
    .action(({ session, options }, message) => {
      if (!session)
        return Promise.resolve('')
      let [source, args] = message.split(config.arguments)
      if (!message.includes(config.arguments))
        [source, args] = [config.echo, message]
      const [name, ...baseArgs] = Argv.parse(source).tokens || []
      const command = ctx.$commander.get(name.content, session)
      const tokens = Argv.parse(args).tokens || []
      const chunks: (typeof tokens)[] = []
      const chunkSize = (options as { count?: number }).count || tokens.length
      while (tokens.length)
        chunks.push(tokens.splice(0, chunkSize))
      const promises = chunks.map(async (chunk) => {
        chunk[chunk.length - 1].terminator = ''
        const argv = command.parse({ tokens: [...baseArgs, ...chunk] })
        return (await session.execute(argv, true)).join(' ')
      }, true)
      return Promise.all(promises).then(lines => lines.join('\n'))
    })
}
