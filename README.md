# TypeScript, Koa & Swagger Starter
This is an example of what is possible with [tsos](https://github.com/brad-jones/tsos/tree/develop).
Also heavily inspired by [tsoa](https://github.com/lukeautry/tsoa)

- Use typescript type information / decorators to define the single source of truth for your endpoints.
- Instead of reflecting at runtime (of which is difficult in js anyway) effectively we reflect at build time by inspecting / modifiying the ast.
- Swagger document is generated from the ast and saved into the "dist" folder at build time.
- Builds an [inversify](http://inversify.io/) container per request, ideally inversify will get a "ContainerScope" scope one day.
- We automatically decorate all classes with the inversify `injectable` decorator so you don't have to.
- Uses Koa only for now but could be extended to support express, hapi and others.
- Automatically registers Middleware, uses filename to sort the order. To disable middleware just rename to something like `000_Foo.ts.disabled`.
- Automatically registers Endpoints, use filepath to define the Route. Can be overridden by specfying an absolute route in the `@Route` decorator.
- SwaggerUI middleware exposes the generated swagger doc at `/docs`.
- We also validate incomming requests against the swagger doc.
- Even still we validate outgoing responses against the swagger doc, do I even need tests...
- Other included middleware, Basic Console Logging, Rate Limiting based on event loop lag, Json Errors while in dev, Helmet and Cors headers.
- dotenv for easy config

## Getting Started
```
git clone https://github.com/brad-jones/ts-koa-swagger.git
cd ./ts-koa-swagger
yarn install
yarn build
yarn start
```
