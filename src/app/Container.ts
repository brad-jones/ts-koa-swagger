import * as Koa from 'koa';
import * as swagger from 'swagger2';
import { IMiddleware } from 'app/Types';
import * as OnFinished from 'on-finished';
import { Server, createServer } from 'http';
import { Container, interfaces } from 'inversify';

let swaggerDoc = swagger.loadDocumentSync(__dirname + '/swagger.json');

export function BuildContainer(): interfaces.Container
{
    let container = new Container();

    // Bind the container to it's self
    // Useful for modules that resolve other modules.
    container.bind<interfaces.Container>('interfaces.Container').toConstantValue(container);

    // Bind the builder into the container so that services may create
    // "scoped" containers. Inversify only supports Singleton and Transient
    // scopes, so in this application Singleton services are not singletons
    // and are more like "ContainerScoped" services. To create a true application
    // wide Singleton we would create the service outside of this builder function.
    container.bind<() => interfaces.Container>('() => interfaces.Container').toConstantValue(BuildContainer);

    // Case in point, the swagger doc obviously doesn't change,
    // so we can read it in once and only once.
    container.bind<swagger.Document>('Document').toConstantValue(swaggerDoc);

    // Register the node.js server service.
    container.bind(Server).toDynamicValue((context: interfaces.Context) =>
    {
        return createServer((req, res) =>
        {
            // Upon each request we build a brand new container
            let requestContainer = context.container.get<() => interfaces.Container>('() => interfaces.Container')();

            // Resolve the Koa application
            let koaApp = requestContainer.get(Koa);

            // Execute the Koa app
            koaApp.callback()(req, res);

            // Clean up the container
            // If the container was disposable this is how we would dispose it.
            // FYI: Inversify is not disposable but my container might be :)
            // For now we don't have any services that need disposing of anyway.
            //OnFinished(res, () => setTimeout(() => requestContainer.Dispose(), 0));
        });
    });

    // Register the Koa App with the container
    // Use the container to lookup all our middleware.
    // The middleware modules sorted based on filename.
    container.bind<Koa>(Koa).toDynamicValue((context: interfaces.Context) =>
    {
        let app = new Koa();

        (context.container['_bindingDictionary']['_map'].get(IMiddleware) as any[])
            .sort((a, b) => a.constraint.metaData.value - b.constraint.metaData.value)
            .forEach(_ => app.use(context.container.getNamed(IMiddleware, _.constraint.metaData.value).Execute));

        return app;
    });

    return container;
}
