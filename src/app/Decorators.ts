import { IKoaBodyOptions } from 'koa-body';

export function Route(path: string): any
{
    return () => { return; };
}

export function Methods(...methods: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>): any
{
    return () => { return; };
}

export function Get(path?: string): any
{
    return () => { return; };
}

export function Post(path?: string): any
{
    return () => { return; };
}

export function Put(path?: string): any
{
    return () => { return; };
}

export function Patch(path?: string): any
{
    return () => { return; };
}

export function Delete(path?: string): any
{
    return () => { return; };
}

export function FromHeader(name?: string, description?: string, required?: boolean): any
{
    return () => { return; };
}

export function FromQuery(name?: string, description?: string, required?: boolean): any
{
    return () => { return; };
}

export function FromRoute(name?: string, description?: string): any
{
    return () => { return; };
}

export function FromBody(type?: 'json' | 'form'): any
{
    return () => { return; };
}

export function Response<T>(statusCode: number, description?: string, mimeType?: string): any
{
    return () => { return; };
}

export function Security(name: string, scopes?: string[]): any
{
    return () => { return; };
}

export function Tags(...values: string[]): any
{
    return () => { return; };
}

export function Hidden(): any
{
    return () => { return; };
}

export function Deprecated(): any
{
    return () => { return; };
}

export function BodyParserOptions(options: IKoaBodyOptions): any
{
    return () => { return; };
}
