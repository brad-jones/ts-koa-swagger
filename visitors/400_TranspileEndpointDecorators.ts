import { Scope  } from "ts-simple-ast";
import { IAstVisitor } from '@brad-jones/tsos-compiler';

let TranspileEndpointDecorators: IAstVisitor = (ast) =>
{
    console.log('Transpiling Endpoint Decorators');

    let endpointClasses = ast.getSourceFiles()
        .map(_ => _.getClasses())
        .reduce((a, b) => a.concat(b))
        .filter(c => c.getImplements().some(i => i.getText() === 'IEndpoint'));

    endpointClasses.forEach(endpointClass =>
    {
        let executeMethod = endpointClass.getInstanceMethodOrThrow('Execute');

        executeMethod.getDecorators().forEach(decorator =>
        {
            let decoratorName = decorator.getName();
            let decoratorArg = decorator.getArguments()[0];

            switch (decoratorName)
            {
                case 'Route':
                    endpointClass.addProperty
                    ({
                        name: 'Route',
                        isStatic: true,
                        scope: Scope.Public,
                        initializer: decoratorArg.getText()
                    });
                    decorator.remove();
                break;

                case 'Methods':
                    endpointClass.addProperty
                    ({
                        name: 'Methods',
                        isStatic: true,
                        scope: Scope.Public,
                        initializer: decoratorArg.getText()
                    });
                    decorator.remove();
                break;

                case 'Get':
                    endpointClass.addProperty
                    ({
                        name: 'Methods',
                        isStatic: true,
                        scope: Scope.Public,
                        initializer: '["GET"]'
                    });

                    if (decoratorArg)
                    {
                        endpointClass.addProperty
                        ({
                            name: 'Route',
                            isStatic: true,
                            scope: Scope.Public,
                            initializer: decoratorArg.getText()
                        });
                    }
                    decorator.remove();
                break;

                case 'Post':
                    endpointClass.addProperty
                    ({
                        name: 'Methods',
                        isStatic: true,
                        scope: Scope.Public,
                        initializer: '["POST"]'
                    });

                    if (decoratorArg)
                    {
                        endpointClass.addProperty
                        ({
                            name: 'Route',
                            isStatic: true,
                            scope: Scope.Public,
                            initializer: decoratorArg.getText()
                        });
                    }
                    decorator.remove();
                break;

                case 'Put':
                    endpointClass.addProperty
                    ({
                        name: 'Methods',
                        isStatic: true,
                        scope: Scope.Public,
                        initializer: '["PUT"]'
                    });

                    if (decoratorArg)
                    {
                        endpointClass.addProperty
                        ({
                            name: 'Route',
                            isStatic: true,
                            scope: Scope.Public,
                            initializer: decoratorArg.getText()
                        });
                    }
                    decorator.remove();
                break;

                case 'Patch':
                    endpointClass.addProperty
                    ({
                        name: 'Methods',
                        isStatic: true,
                        scope: Scope.Public,
                        initializer: '["PATCH"]'
                    });

                    if (decoratorArg)
                    {
                        endpointClass.addProperty
                        ({
                            name: 'Route',
                            isStatic: true,
                            scope: Scope.Public,
                            initializer: decoratorArg.getText()
                        });
                    }
                    decorator.remove();
                break;

                case 'Delete':
                    endpointClass.addProperty
                    ({
                        name: 'Methods',
                        isStatic: true,
                        scope: Scope.Public,
                        initializer: '["DELETE"]'
                    });

                    if (decoratorArg)
                    {
                        endpointClass.addProperty
                        ({
                            name: 'Route',
                            isStatic: true,
                            scope: Scope.Public,
                            initializer: decoratorArg.getText()
                        });
                    }
                    decorator.remove();
                break;

                case 'BodyParserOptions':
                    endpointClass.addProperty
                    ({
                        name: 'BodyParserOptions',
                        isStatic: true,
                        scope: Scope.Public,
                        initializer: decoratorArg.getText()
                    });
                    decorator.remove();
                break;
            }
        });
    });
};

export default TranspileEndpointDecorators;
