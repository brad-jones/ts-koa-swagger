import * as Koa from 'koa';
import * as KoaBody from 'koa-body';
import * as swagger from 'swagger2';
import { interfaces } from 'inversify';
import * as KoaRouter from 'koa-router';
import * as KoaCompose from 'koa-compose';
import { validate as SwaggerValidate } from 'swagger2-koa';
import { IEndpoint, IEndpointStatic, IMiddleware } from 'app/Types';

export default class Router implements IMiddleware
{
    public readonly UnderlyingRouter: KoaRouter = new KoaRouter();

    public constructor(private container: interfaces.Container, private swaggerDoc: swagger.Document)
    {
        (container['_bindingDictionary']['_map'].get(IEndpoint) as any[]).forEach(_ =>
        {
            let endpointPath = _.constraint.metaData.value;
            let endpointStatic = _.implementationType as IEndpointStatic;

            this.UnderlyingRouter.register
            (
                this.BuildEndpointRoute(endpointPath, endpointStatic),
                endpointStatic.Methods,
                this.BuildEndpointExecutor(endpointPath, endpointStatic),
                { name: endpointStatic.name }
            );
        });
    }

    public get Execute()
    {
        return KoaCompose
        ([
            this.UnderlyingRouter.routes(),
            this.UnderlyingRouter.allowedMethods()
        ]);
    }

    private BuildEndpointRoute(endpointPath: string, endpointStatic: IEndpointStatic): string
    {
        if (typeof endpointStatic.Route === 'string')
        {
            // koa-router uses the syntax "/foo/:bar" for route parameters.
            // We use "/foo/{bar}" mainly because swagger does as well.
            let route = endpointStatic.Route.replace('{', ':').replace('}', '');

            // If the route starts with a slash consider
            // it absolute and make no further changes.
            if (route.startsWith('/')) return route;

            // Otherwise consider it relative to the endpoint path.
            return '/' + endpointPath + '/' + route;
        }

        // Fall back to endpoint path which is based on the module file path.
        return '/' + endpointPath;
    }

    private BuildEndpointExecutor(endpointPath: string, endpointStatic: IEndpointStatic): KoaRouter.IMiddleware
    {
        let executor = async (ctx: KoaRouter.IRouterContext) =>
        {
            // Bind the router context into the container,
            // so that endpoints and other required services
            // may resolve the context.
            this.container.bind<KoaRouter.IRouterContext>('Router.IRouterContext').toConstantValue(ctx);

            // Resolve the endpoint
            let endpointInstance = this.container.getNamed(IEndpoint, endpointPath);

            // Execute the endpoint.
            // NOTE: All endpoint parameters are transpiled into calls
            // against the injected context something like:
            // Execute(){ let foo = this.Ctx.query['foo']; }
            // Hence we do not pass in any parameters here.
            var response = await endpointInstance.Execute();

            // Write the return value to the response.
            // TODO: Perhaps write some smarter content negoation logic.
            ctx.response.body = response;
        };

        // If the endpoint accepts methods that can have bodies
        // we will run the koa-body parser before executing the endpoint.
        if (['POST', 'PUT', 'PATCH'].some(v => endpointStatic.Methods.map(_ => _.toUpperCase()).includes(v)))
        {
            executor = KoaCompose([KoaBody(endpointStatic.BodyParserOptions), SwaggerValidate(this.swaggerDoc), executor]);
        }
        else
        {
            executor = KoaCompose([SwaggerValidate(this.swaggerDoc), executor]);
        }

        return executor;
    }
}
