import 'server-only'

import { neon } from '@neondatabase/serverless'

// Privileged server queries use the encrypted database connection. Browser and
// ordinary user queries continue to use the Data API and its verified JWT/RLS.
const identifier = (name: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new Error('Invalid database identifier')
  return `"${name}"`
}

function splitList(text: string) {
  const items: string[] = []
  let depth = 0,
    quoted = false,
    start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quoted = !quoted
    if (!quoted) {
      if (char === '(') depth++
      if (char === ')') depth--
      if (char === ',' && depth === 0) {
        items.push(text.slice(start, i))
        start = i + 1
      }
    }
  }
  items.push(text.slice(start))
  return items.map((item) => item.trim()).filter(Boolean)
}

function projection(select: string, table: string, alias = 'r'): string {
  return splitList(select)
    .map((item) => {
      if (item === '*') return `${alias}.*`
      const embedded = /^([\w:]+)\((.*)\)$/.exec(item)
      if (embedded) {
        const [label, relation] = embedded[1].includes(':')
          ? embedded[1].split(':')
          : [embedded[1], embedded[1]]
        // This is the embedded relationship used by the application's admin API.
        if (table !== 'chamgab_analyses' || relation !== 'properties')
          throw new Error('Unsupported server relationship')
        return `(SELECT to_jsonb(related) FROM (SELECT ${projection(embedded[2], relation, 'p')} FROM public.properties AS p WHERE p.id=${alias}.property_id LIMIT 1) related) AS ${identifier(label)}`
      }
      const [label, column] = item.includes(':')
        ? item.split(':')
        : [item, item]
      return `${alias}.${identifier(column)} AS ${identifier(label)}`
    })
    .join(', ')
}

export const databaseFetch: typeof fetch = async (input, init) => {
  try {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const headers = new Headers(init?.headers)
    const method = (init?.method || 'GET').toUpperCase()
    const sql = neon(process.env.DATABASE_URL!)
    const parts = url.pathname.split('/').filter(Boolean)
    const table = parts.at(-1)!
    identifier(table)
    const params: unknown[] = []
    const bind = (value: unknown) => {
      params.push(value)
      return `$${params.length}`
    }
    let rows: Record<string, unknown>[]
    let count: number | undefined

    if (parts.at(-2) === 'rpc') {
      const args =
        method === 'GET'
          ? Object.fromEntries(url.searchParams)
          : JSON.parse(String(init?.body || '{}'))
      const argumentsSql = Object.entries(args)
        .map(([name, value]) => `${identifier(name)} => ${bind(value)}`)
        .join(', ')
      const signature =
        await sql`SELECT proretset FROM pg_proc JOIN pg_namespace ON pg_namespace.oid=pronamespace WHERE nspname='public' AND proname=${table} LIMIT 1`
      if (!signature.length) throw new Error('Unknown database function')
      const query = signature[0].proretset
        ? `SELECT to_jsonb(result) AS data FROM public.${identifier(table)}(${argumentsSql}) AS result`
        : `SELECT to_jsonb(public.${identifier(table)}(${argumentsSql})) AS data`
      rows = await sql.query(query, params)
      const data = signature[0].proretset
        ? rows.map((row) => row.data)
        : rows[0]?.data
      return Response.json(data ?? null)
    }

    const filter = (column: string, expression: string): string => {
      if (column === 'or' || column === 'and') {
        if (!expression.startsWith('(') || !expression.endsWith(')'))
          throw new Error('Invalid filter group')
        return `(${splitList(expression.slice(1, -1))
          .map((part) => {
            const separator = part.indexOf('.')
            if (separator < 1) throw new Error('Invalid filter')
            return filter(part.slice(0, separator), part.slice(separator + 1))
          })
          .join(column === 'or' ? ' OR ' : ' AND ')})`
      }
      const field = `r.${identifier(column)}`
      if (expression.startsWith('not.'))
        return `NOT (${filter(column, expression.slice(4))})`
      const separator = expression.indexOf('.')
      const operator = expression.slice(0, separator),
        value = expression.slice(separator + 1)
      if (separator < 1) throw new Error('Invalid filter')
      if (operator === 'is') {
        if (!['null', 'true', 'false'].includes(value))
          throw new Error('Invalid is filter')
        return `${field} IS ${value.toUpperCase()}`
      }
      if (operator === 'in') {
        if (!value.startsWith('(') || !value.endsWith(')'))
          throw new Error('Invalid list filter')
        const values = splitList(value.slice(1, -1)).map((v) =>
          v.startsWith('"') ? JSON.parse(v) : v
        )
        return values.length
          ? `${field} IN (${values.map(bind).join(', ')})`
          : 'FALSE'
      }
      const operators: Record<string, string> = {
        eq: '=',
        neq: '<>',
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<=',
        like: 'LIKE',
        ilike: 'ILIKE',
      }
      if (!operators[operator]) throw new Error('Unsupported filter operator')
      return `${field} ${operators[operator]} ${bind(['like', 'ilike'].includes(operator) ? value.replaceAll('*', '%') : value)}`
    }
    const reserved = new Set([
      'select',
      'order',
      'limit',
      'offset',
      'on_conflict',
      'columns',
    ])
    const conditions = Array.from(url.searchParams)
      .filter(([key]) => !reserved.has(key))
      .map(([key, value]) => filter(key, value))
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    const select = projection(url.searchParams.get('select') || '*', table)
    const prefer = headers.get('prefer') || ''
    if (method === 'GET' || method === 'HEAD') {
      if (prefer.includes('count=')) {
        const result = await sql.query(
          `SELECT count(*)::int AS count FROM public.${identifier(table)} AS r${where}`,
          params
        )
        count = Number(result[0].count)
      }
      const orders = splitList(url.searchParams.get('order') || '').map(
        (part) => {
          const [column, direction = 'asc', nulls] = part.split('.')
          if (
            !['asc', 'desc'].includes(direction) ||
            (nulls && !['nullsfirst', 'nullslast'].includes(nulls))
          )
            throw new Error('Invalid sort order')
          return `r.${identifier(column)} ${direction.toUpperCase()}${nulls ? ` NULLS ${nulls === 'nullsfirst' ? 'FIRST' : 'LAST'}` : ''}`
        }
      )
      const numeric = (name: string, fallback: number) => {
        const value = url.searchParams.get(name)
        if (value !== null && !/^\d+$/.test(value))
          throw new Error('Invalid pagination')
        return value === null ? fallback : Number(value)
      }
      const limit = Math.min(numeric('limit', 10000), 10000),
        offset = numeric('offset', 0)
      rows =
        method === 'HEAD'
          ? []
          : await sql.query(
              `SELECT ${select} FROM public.${identifier(table)} AS r${where}${orders.length ? ` ORDER BY ${orders.join(', ')}` : ''} LIMIT ${bind(limit)} OFFSET ${bind(offset)}`,
              params
            )
      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (count !== undefined)
        responseHeaders['Content-Range'] =
          `${rows.length ? `${offset}-${offset + rows.length - 1}` : '*'}/${count}`
      if (method === 'HEAD')
        return new Response(null, { status: 200, headers: responseHeaders })
      return resultResponse(rows, headers, responseHeaders)
    }

    let mutation: string
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body || '{}'))
      const records: Record<string, unknown>[] = Array.isArray(body)
        ? body
        : [body]
      if (!records.length) return Response.json([])
      const columns = Array.from(
        new Set(records.flatMap((record) => Object.keys(record)))
      )
      const values = records.map(
        (record) =>
          `(${columns.map((column) => (column in record ? bind(record[column]) : 'DEFAULT')).join(', ')})`
      )
      mutation = `INSERT INTO public.${identifier(table)} AS r (${columns.map(identifier).join(', ')}) VALUES ${values.join(', ')}`
      if (prefer.includes('resolution=')) {
        const conflict = splitList(url.searchParams.get('on_conflict') || 'id')
        const updates = columns
          .filter((column) => !conflict.includes(column))
          .map(
            (column) => `${identifier(column)}=EXCLUDED.${identifier(column)}`
          )
        mutation += ` ON CONFLICT (${conflict.map(identifier).join(', ')}) ${prefer.includes('ignore-duplicates') || !updates.length ? 'DO NOTHING' : `DO UPDATE SET ${updates.join(', ')}`}`
      }
    } else if (method === 'PATCH') {
      const body = JSON.parse(String(init?.body || '{}'))
      const updates = Object.entries(body).map(
        ([column, value]) => `${identifier(column)}=${bind(value)}`
      )
      if (!updates.length) throw new Error('Empty update')
      mutation = `UPDATE public.${identifier(table)} AS r SET ${updates.join(', ')}${where}`
    } else if (method === 'DELETE') {
      mutation = `DELETE FROM public.${identifier(table)} AS r${where}`
    } else throw new Error('Unsupported database operation')
    rows = await sql.query(
      `WITH changed AS (${mutation} RETURNING *) SELECT ${select} FROM changed AS r`,
      params
    )
    if (!prefer.includes('return=representation'))
      return new Response(null, { status: method === 'POST' ? 201 : 204 })
    return resultResponse(rows, headers)
  } catch (error) {
    return Response.json(
      {
        code: 'NEON_SQL_ERROR',
        message:
          error instanceof Error ? error.message : 'Database operation failed',
      },
      { status: 400 }
    )
  }
}

function resultResponse(
  rows: Record<string, unknown>[],
  headers: Headers,
  responseHeaders?: Record<string, string>
) {
  if (headers.get('accept')?.includes('application/vnd.pgrst.object+json')) {
    if (rows.length !== 1)
      return Response.json(
        {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
          details: `The result contains ${rows.length} rows`,
        },
        { status: 406, headers: responseHeaders }
      )
    return Response.json(rows[0], { headers: responseHeaders })
  }
  return Response.json(rows, { headers: responseHeaders })
}
