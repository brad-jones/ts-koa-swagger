import * as Koa from 'koa';
import * as KoaLogger from 'koa-logger';
import { IMiddleware } from 'app/Types';

export default class Logger implements IMiddleware
{
    public get Execute()
    {
        if (process.env['NODE_ENV'] === 'development')
        {
            return KoaLogger();
        }
        else
        {
            return async (ctx, next) => { await next(); };
        }
    }
}
