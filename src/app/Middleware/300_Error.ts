import * as Koa from 'koa';
import { IMiddleware } from 'app/Types';
import * as KoaJsonError from 'koa-json-error';

export default class Cors implements IMiddleware
{
    public get Execute()
    {
        if (process.env['NODE_ENV'] === 'development')
        {
            return KoaJsonError();
        }
        else
        {
            return async (ctx, next) => { await next(); };
        }
    }
}
