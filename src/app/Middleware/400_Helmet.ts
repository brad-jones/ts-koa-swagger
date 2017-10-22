import * as Koa from 'koa';
import * as KoaHelmet from 'koa-helmet';
import { IMiddleware } from 'app/Types';

export default class Helmet implements IMiddleware
{
    public get Execute()
    {
        return KoaHelmet();
    }
}
