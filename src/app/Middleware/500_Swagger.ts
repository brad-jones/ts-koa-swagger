import * as Koa from 'koa';
import { ui } from 'swagger2-koa';
import * as swagger from 'swagger2';
import { IMiddleware } from 'app/Types';

export default class Swagger implements IMiddleware
{
    public constructor(private swaggerDoc: swagger.Document){}

    public get Execute()
    {
        return ui(this.swaggerDoc, '/docs');
    }
}
