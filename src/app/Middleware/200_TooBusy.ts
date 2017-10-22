import * as Koa from 'koa';
import toobusy = require('toobusy-js');
import { IMiddleware } from 'app/Types';

export default class TooBusy implements IMiddleware
{
    public async Execute(ctx: Koa.Context, next: () => Promise<any>)
    {
        if (toobusy())
        {
            ctx.status = 503;
            ctx.body = 'Server is too busy, try again later.';
            return;
        }

        await next();
    }
}
