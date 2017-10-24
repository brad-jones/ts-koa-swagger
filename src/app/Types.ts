import * as Koa from 'koa';
import * as KoaBody from 'koa-body';
import * as KoaRouter from 'koa-router';

export abstract class IMiddleware
{
    abstract Execute: Koa.Middleware;
}

export interface IMiddlewareStatic
{
    new(...args: any[]): IMiddleware;
}

export abstract class IEndpoint
{
    abstract Ctx: KoaRouter.IRouterContext;

    abstract Execute(...args: any[]): Promise<any>;
}

export interface IEndpointStatic
{
    new (...args: any[]): IEndpoint;

    readonly Route?: string;

    readonly Methods: string[];

    readonly BodyParserOptions?: KoaBody.IKoaBodyOptions;
}

export interface IMultiPartForm
{
    fields: { [name: string]: any };
    files: { [name: string]: IFileDownload };
}

export interface IFileDownload
{
    size: number;
    path: string;
    name: string;
    type: string;
    mtime: Date;
}

export interface I400InvalidResponse
{
    code: string;
    errors:
    {
        actual: object,
        expected: object,
        error: string,
        where: string
    }[];
}
