import { fs } from 'mz';
import * as path from 'path';
import { IAstVisitor } from '@brad-jones/tsos-compiler';

let AutoRegisterMiddleware: IAstVisitor = async (ast) =>
{
    console.log('Inserting Middleware Bindings into Container');

    let srcDir = await fs.realpath(__dirname + '/../src');

    let containerSrcFile = ast.getSourceFile('src/app/Container.ts');

    let middlewareClasses = ast.getSourceFiles()
        .map(_ => _.getClasses())
        .reduce((a, b) => a.concat(b))
        .filter(c => c.getImplements().some(i => i.getText() === 'IMiddleware'));

    containerSrcFile.addImport({ namedImports: [{name: 'IMiddleware'}], moduleSpecifier: 'app/Middleware/IMiddleware' });

    containerSrcFile.addImports(middlewareClasses.map((middleware, index) =>
    {
        return {
            defaultImport: 'Middleware_' + index,
            moduleSpecifier: middleware.getSourceFile().getFilePath().replace(srcDir + '/', '').replace('.ts', '')
        };
    }));

    middlewareClasses.forEach((middleware, index) =>
    {
        let middlewareOrder = path.basename(middleware.getSourceFile().getFilePath(), '.ts').split('_')[0];

        let buildContainerFunc = containerSrcFile.getFunction('BuildContainer');
        let body = buildContainerFunc.getBody().getText().trim();
        buildContainerFunc.setBodyText(`${body.substring(1, body.length - 1).replace('return container;', '')}\ncontainer.bind(IMiddleware).to(Middleware_${index}).whenTargetNamed('${middlewareOrder}');\nreturn container;`);
    });
};

export default AutoRegisterMiddleware;
