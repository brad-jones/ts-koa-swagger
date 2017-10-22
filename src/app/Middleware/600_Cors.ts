import * as Koa from 'koa';
import * as KoaCors from '@koa/cors';
import { IMiddleware } from 'app/Types';

export default class Cors implements IMiddleware
{
    public get Execute()
    {
        return KoaCors();
    }
}
