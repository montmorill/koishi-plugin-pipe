import type { Context, Session, Token } from 'koishi'
import { Argv, clone, Schema } from 'koishi'

export const name = 'pipe'

export interface Config {
  pipe: boolean
  xargs: boolean
  separator: string
  arguments: string
  echo: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    pipe: Schema.boolean().default(true).description('启用管道。'),
    xargs: Schema.boolean().default(true).description('启用 xargs 函数。'),
    echo: Schema.string().default('echo').description('默认命令。'),
  }),
  Schema.object({
    separator: Schema.string().default('|').description('管道分隔符。'),
    arguments: Schema.string().default('--').description('参数分隔符。'),
  }).description('高级设置'),
])

export function apply(ctx: Context, config: Config) {
  async function resolveInterpolation(argv: Argv, session: Session) {
    const stack = []
    for (const token of argv.tokens || []) {
      for (const inter of token.inters) {
        const execution = await executeWithPipe(inter, session)
        const transformed = await session.transform(execution)
        stack.push(transformed.join(''))
      }
      for (const { pos } of token.inters.reverse()) {
        token.content = token.content.slice(0, pos)
          + stack.pop()
          + token.content.slice(pos)
      }
      token.inters = []
    }
  }

  async function executeWithPipe(argv: Argv, session: Session = argv.session!) {
    await resolveInterpolation(argv, session)
    const segments: Token[][] = [[]]
    let current = segments[0]
    for (const token of argv.tokens || []) {
      if (!token.quoted && token.content.startsWith(config.separator)) {
        current[current.length - 1].terminator = ''
        segments.push(current = [])
        token.content = token.content.slice(config.separator.length)
        if (token.content)
          current.push(token)
      }
      else {
        current.push(token)
      }
    }
    current[current.length - 1].terminator = ''
    argv.tokens = segments.shift() || []
    let elements = await session.execute(clone(argv), true)
    for (const segment of segments) {
      argv.tokens = segment
      const name = argv.tokens[0].content || config.echo
      const command = session.app.$commander.get(name, session)
      if (argv.tokens.length) {
        argv.tokens[argv.tokens.length - 1].terminator
          = command.name === 'xargs' ? ` ${config.arguments} ` : ' '
      }
      argv.tokens.push(...Argv.parse(elements.join('')).tokens || [])
      if (argv.tokens.length) {
        const lastToken = argv.tokens[argv.tokens.length - 1]
        lastToken.terminator = lastToken.terminator.trimEnd()
      }
      elements = await session.execute(clone(argv), true)
    }
    return elements
  }

  config.pipe && ctx.middleware(async (session, next) => {
    if (session.content && session.content.includes(config.separator))
      return await executeWithPipe(Argv.parse(session.content), session)
    return next()
  }, true)

  config.xargs && ctx.command(`xargs <command:text> ${config.arguments} <arguments:text>`, '转发指令参数')
    .option('count', '-n <count:number> 最大执行字段数')
    .action(({ session, options }, message) => {
      if (!session)
        return Promise.resolve('')
      let [source, args] = message.split(` ${config.arguments} `)
      if (!args?.trim())
        [source, args] = [config.echo, message]
      const [name, ...baseArgs] = Argv.parse(source).tokens || []
      if (baseArgs.length)
        baseArgs[baseArgs.length - 1].terminator = ' '
      const command = ctx.$commander.get(name.content, session)
      const tokens = Argv.parse(args).tokens || []
      const chunks: (typeof tokens)[] = []
      const chunkSize = (options as { count?: number }).count || tokens.length
      while (tokens.length)
        chunks.push(tokens.splice(0, chunkSize))
      const promises = chunks.map(async (chunk) => {
        chunk[chunk.length - 1].terminator = ''
        const argv = command.parse({ tokens: [...baseArgs, ...chunk] })
        return (await session.execute(argv, true)).join('')
      }, true)
      return Promise.all(promises).then(lines => lines.join('\n'))
    })
}
