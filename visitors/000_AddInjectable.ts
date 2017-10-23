import { IVisitorContext } from './IVisitorContext';
import { IAstVisitor } from '@brad-jones/tsos-compiler';

let AddInjectable: IAstVisitor = (ast, ctx: IVisitorContext) =>
{
    let srcFiles = ast.getSourceFiles();

    console.log('Adding injectable imports.');
    srcFiles.forEach(srcFile => srcFile.addImports
    ([
        { namedImports: [{ name: 'injectable' }, { name: 'inject' }], moduleSpecifier: 'inversify' }
    ]));

    console.log('Finding injectable classes');
    ctx.injectAbleClasses = srcFiles.map(_ => _.getClasses()).reduce((a, b) => a.concat(b));

    console.log('Adding inversify "injectable" decorator to all injectable classes.');
    ctx.injectAbleClasses.forEach(c => c.addDecorator({ name: 'injectable', arguments: [] }));

    console.log('Adding "inject" decorators for named interfaces.');
    ctx.injectAbleClasses.forEach(c =>
        c.getConstructors().forEach(ctor =>
            ctor.getParameters().filter(p =>
                !p.getDecorators().some(d =>
                    d.getName() === 'inject' ||
                    d.getName() === 'multiInject'
                )
            ).forEach(p =>
                p.addDecorator
                ({
                    name: 'inject',
                    arguments: [`"${p.getType().getText()}"`]
                })
            )
        )
    );
};

export default AddInjectable;
