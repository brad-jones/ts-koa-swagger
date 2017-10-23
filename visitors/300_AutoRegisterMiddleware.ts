import * as path from 'path';
import { IVisitorContext } from './IVisitorContext';
import { IAstVisitor } from '@brad-jones/tsos-compiler';

let AutoRegisterMiddleware: IAstVisitor = async (ast, ctx: IVisitorContext) =>
{
    console.log('Inserting Middleware Bindings into Container');

    ctx.middlewareClasses = ctx.injectAbleClasses
        .filter(c => c.getImplements().some(i => i.getText() === 'IMiddleware'));

    ctx.containerSrcFile.addImport({ namedImports: [{name: 'IMiddleware'}], moduleSpecifier: 'app/Middleware/IMiddleware' });

    ctx.containerSrcFile.addImports(ctx.middlewareClasses.map((middleware, index) =>
    {
        return {
            defaultImport: 'Middleware_' + index,
            moduleSpecifier: middleware.getSourceFile().getFilePath().replace(ctx.srcDir + '/', '').replace('.ts', '')
        };
    }));

    ctx.middlewareClasses.forEach((middleware, index) =>
    {
        let middlewareOrder = path.basename(middleware.getSourceFile().getFilePath(), '.ts').split('_')[0];

        let buildContainerFunc = ctx.containerSrcFile.getFunction('BuildContainer');
        let body = buildContainerFunc.getBody().getText().trim();
        buildContainerFunc.setBodyText(`${body.substring(1, body.length - 1).replace('return container;', '')}\ncontainer.bind(IMiddleware).to(Middleware_${index}).whenTargetNamed('${middlewareOrder}');\nreturn container;`);
    });
};

export default AutoRegisterMiddleware;
