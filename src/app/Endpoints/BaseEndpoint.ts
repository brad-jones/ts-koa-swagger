import { inject } from 'inversify';
import { IRouterContext } from 'koa-router';

export abstract class BaseEndpoint
{
    @inject('Router.IRouterContext')
    public Ctx: IRouterContext;

    public readonly Methods = ['GET'];
}
