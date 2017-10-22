import { fs } from 'mz';
import * as path from 'path';
import { trim } from 'lodash';
import * as ts from 'typescript';
import * as shell from 'shelljs';
import jsonic = require('jsonic');
import * as changeCase from 'change-case';
import { IAstVisitor } from '@brad-jones/tsos-compiler';
import OpenApiSpecBuilder from '@brad-jones/openapi-spec-builder';
import ISchema from '@brad-jones/openapi-spec-builder/lib/v2/Modified/ISchema';
import IEndpoint from '@brad-jones/openapi-spec-builder/lib/v2/Modified/IEndpoint';
import IResponse from '@brad-jones/openapi-spec-builder/lib/v2/Modified/IResponse';
import IParameter from '@brad-jones/openapi-spec-builder/lib/v2/Modified/IParameter';
import { Type, InterfaceDeclaration, TypeGuards, PropertyDeclaration, Symbol } from "ts-simple-ast";

let GenerateSwaggerDoc: IAstVisitor = async (ast) =>
{
    console.log('Generating Swagger Document');

    let srcDir = await fs.realpath(__dirname + '/../src');

    let endpointClasses = ast.getSourceFiles()
        .map(_ => _.getClasses())
        .reduce((a, b) => a.concat(b))
        .filter(c => c.getImplements().some(i => i.getText() === 'IEndpoint'));

    let spec = new OpenApiSpecBuilder
    ({
        info:
        {
            version: '1.0.0',
            title: 'Typescript Koa Swagger Starter',
            license: { name: 'MIT' }
        },
        schemes: ['http'],
        endpoints: endpointClasses.map(endpointClass =>
        {
            let executeMethod = endpointClass.getInstanceMethodOrThrow('Execute');
            let executeMethodDecorators = executeMethod.getDecorators();

            let endpointPath = '/' + changeCase.pathCase
            (
                endpointClass.getSourceFile().getFilePath()
                .replace(srcDir + '/app/Endpoints', '')
                .replace('.ts', '')
            );

            let route = endpointClass.getStaticProperty('Route') as PropertyDeclaration;
            if (route)
            {
                let routePath = trim(route.getInitializerOrThrow().getText(), '"\'');
                if (routePath.startsWith('/'))
                {
                    endpointPath = routePath;
                }
                else
                {
                    endpointPath = endpointPath + '/' + routePath;
                }
            }

            let methods: Array<'get' | 'post' | 'put' | 'patch' | 'delete'> = ['get'];
            let methodsProp = endpointClass.getStaticProperty('Methods') as PropertyDeclaration;
            if (methodsProp)
            {
                methods = JSON.parse(methodsProp.getInitializerOrThrow().getText())
                    .map(m => m.toLowerCase());
            }

            let tags: string[] = [];
            let tag = executeMethodDecorators.find(d => d.getName() === 'Tags');
            if (tag)
            {
                tags = tag.getArguments().map(_ => trim(_.getText(), '"\''));
            }

            let summary = ''; let description = '';
            let docBlock = endpointClass.getDocumentationComment();
            if (docBlock)
            {
                let lines = docBlock.split("\n");
                summary = lines[0];
                description = trim(lines.slice(1).join("\n"));
            }

            let consumes: string[] = [];
            let bodyParserOptionsProp = endpointClass.getStaticProperty('BodyParserOptions') as PropertyDeclaration;
            if (bodyParserOptionsProp && bodyParserOptionsProp.getInitializer())
            {
                let options = jsonic(bodyParserOptionsProp.getInitializer().getText());

                if (options.multipart)
                {
                    consumes.push('multipart/form-data');
                }
            }
            else if (executeMethod.getParameters().filter(_ => _.getDecorators().some(d => d.getName() === 'FromBody' && d.getArguments()[0] && trim(d.getArguments()[0].getText(), '"\'') === 'form')).length > 0)
            {
                consumes.push('application/x-www-form-urlencoded');
            }
            else if (executeMethod.getParameters().filter(_ => _.getDecorators().some(d => d.getName() === 'FromBody')).length > 0)
            {
                consumes.push('application/json');
            }

            let produces = [];

            let responses: IResponse[] =
            [
                {
                    statusCode: 500,
                    description: 'Internal Server Error'
                },
                {
                    statusCode: 400,
                    description: 'Invalid Request',
                    schema:
                    {
                        type: 'object',
                        properties:
                        {
                            code: { type: 'string' },
                            errors:
                            {
                                type: 'array',
                                items:
                                {
                                    type: 'object',
                                    properties:
                                    {
                                        actual: { type: 'object' },
                                        expected: { type: 'object' },
                                        error: { type: 'string' },
                                        where: { type: 'string' }
                                    }
                                }
                            }
                        }
                    }
                }
            ];

            let responseDecorators = executeMethodDecorators.filter(d => d.getName() === 'Response');
            if (responseDecorators.length > 0)
            {
                responseDecorators.forEach(d =>
                {
                    let args = d.getArguments();
                    let typeArgs = d.getTypeArguments();

                    if (args[2])
                    {
                        produces.push(trim(args[2].getText(), '"\''));
                    }

                    let response: IResponse = {
                        statusCode: parseInt(trim(args[0].getText(), '"\'')),
                        description: args[1] && trim(args[1].getText(), '"\'') || ''
                    };

                    if (typeArgs[0])
                    {
                        let buildSchema = (type: Type<ts.Type> | InterfaceDeclaration): ISchema =>
                        {
                            let required = [];

                            let schema: ISchema =
                            {
                                type: 'object'
                            };

                            let schemaProps: { [name: string]: ISchema } = {};

                            let props: Symbol[] = [];

                            if (TypeGuards.isInterfaceDeclaration(type as any))
                            {
                                props = (type as InterfaceDeclaration).getProperties().map(_ => _.getSymbol());
                            }
                            else
                            {
                                props = type.getProperties() as Symbol[];
                            }

                            props.forEach(prop =>
                            {
                                if (!(prop.compilerSymbol.getDeclarations() as any).some(_ => _.questionToken))
                                {
                                    required.push(prop.getName());
                                }

                                let type = prop.getTypeAtLocation(d).getText().toLowerCase();
                                if (type.includes('array') || type.includes('[]')) type = 'array';

                                let description = '';
                                let valueDeclaration = prop.compilerSymbol.valueDeclaration as any;
                                if (valueDeclaration.jsDoc && valueDeclaration.jsDoc[0] && valueDeclaration.jsDoc[0].comment)
                                {
                                    description = valueDeclaration.jsDoc[0].comment;
                                }

                                if
                                (
                                    prop.getTypeAtLocation(d).isInterfaceType() ||
                                    prop.getTypeAtLocation(d).isAnonymousType() ||
                                    (
                                        prop.getTypeAtLocation(d).getTypeArguments()[0] &&
                                        (
                                            prop.getTypeAtLocation(d).getTypeArguments()[0].isAnonymousType() ||
                                            prop.getTypeAtLocation(d).getTypeArguments()[0].isInterfaceType()
                                        )
                                    )
                                ){
                                    schemaProps[prop.getName()] =
                                    {
                                        type: type === 'array' ? 'array' : 'object',
                                        description: description
                                    };

                                    if (type === 'array')
                                    {
                                        if (prop.getTypeAtLocation(d).getTypeArguments()[0])
                                        {
                                            schemaProps[prop.getName()].items = buildSchema(prop.getTypeAtLocation(d).getTypeArguments()[0]);
                                        }
                                        else
                                        {
                                            schemaProps[prop.getName()].items = buildSchema(prop.getTypeAtLocation(d));
                                        }
                                    }
                                    else
                                    {
                                        schemaProps[prop.getName()].properties = buildSchema(prop.getTypeAtLocation(d)).properties;
                                    }
                                }
                                else
                                {
                                    schemaProps[prop.getName()] =
                                    {
                                        type: type as 'array' | 'boolean' | 'integer' | 'number' | 'null' | 'object' | 'string' | 'file',
                                        description: description
                                    };

                                    if (type === 'array')
                                    {
                                        schemaProps[prop.getName()].items =
                                        {
                                            type: prop.getTypeAtLocation(d).getText().toLowerCase().replace('array', '').replace('[]', '').replace('<', '').replace('>', '') as any
                                        };
                                    }
                                }
                            });

                            if (required.length > 0) schema.required = required;
                            schema.properties = schemaProps;

                            return schema;
                        };

                        let interfaceNode = ast.getSourceFiles()
                            .map(_ => _.getInterfaces())
                            .reduce((c, p) => c.concat(p))
                            .find(_ => _.getName() === typeArgs[0].getText());

                        response.schema = buildSchema(interfaceNode);
                    }

                    responses.push(response);
                });
            }
            else
            {
                produces.push('application/json');
            }

            let endpoints: IEndpoint[] = [];

            for (let method of methods)
            {
                endpoints.push
                ({
                    summary: summary,
                    description: description,
                    path: endpointPath,
                    method: method,
                    deprecated: executeMethodDecorators.findIndex(d => d.getName() === 'Deprecated') > 0,
                    tags: tags,
                    consumes: consumes,
                    produces: produces,
                    security: executeMethodDecorators
                    .filter(_ => _.getName() === 'Security')
                    .map(_ =>
                    {
                        let args = _.getArguments();
                        let key = trim(args[0].getText(), '"\'');
                        let obj = {};
                        obj[key] = [];
                        if (args[1]) obj[key] = JSON.parse(args[1].getText());
                        return obj;
                    }),
                    parameters: executeMethod.getParameters().length === 0 ? [] : executeMethod.getParameters().map(param =>
                    {
                        let parameters: IParameter[] = [];

                        let fromDecorator = param.getDecorators().find(d => d.getName().startsWith('From'));
                        let formDecoratorArgs = fromDecorator.getArguments();
                        let location = fromDecorator.getName().replace('From', '').replace('Route', 'Path').toLowerCase() as 'query' | 'header' | 'path' | 'formData' | 'body';

                        if (location === 'body')
                        {
                            if (consumes.includes('multipart/form-data') || formDecoratorArgs[0] && trim(formDecoratorArgs[0].getText(), '"\'') === 'form')
                            {
                                if (consumes.includes('multipart/form-data'))
                                {
                                    parameters = param.getType().getProperties().find(_ => _.getName() === 'fields')
                                    .getTypeAtLocation(param).getProperties().map(prop =>
                                    {
                                        let type = prop.getTypeAtLocation(param).getText().toLowerCase();
                                        if (type.includes('array') || type.includes('[]')) type = 'array';

                                        let description = '';
                                        let valueDeclaration = prop.compilerSymbol.valueDeclaration as any;
                                        if (valueDeclaration.jsDoc && valueDeclaration.jsDoc[0] && valueDeclaration.jsDoc[0].comment)
                                        {
                                            description = valueDeclaration.jsDoc[0].comment;
                                        }

                                        let p = <IParameter>{
                                            name: prop.getName(),
                                            in: 'formData',
                                            type: type as 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'file',
                                            description: description,
                                            required: !(prop.compilerSymbol.getDeclarations() as any).some(_ => _.questionToken)
                                        };

                                        if (type === 'array')
                                        {
                                            p.items =
                                            {
                                                type: prop.getTypeAtLocation(param).getText().toLowerCase().replace('array', '').replace('[]', '').replace('<', '').replace('>', '') as any
                                            };
                                        }

                                        return p;
                                    });

                                    parameters.push(...param.getType().getProperties().find(_ => _.getName() === 'files')
                                    .getTypeAtLocation(param).getProperties().map(prop =>
                                    {
                                        let type = prop.getTypeAtLocation(param).getText().toLowerCase();
                                        if (type.includes('array') || type.includes('[]')) type = 'array';
                                        if (type === 'array')
                                        {
                                            throw new Error('Swagger 2.0 does not really support multi-uploads, koa-body does though, so until we upgrade to OpenAPI 3.0 please hide this endpoint "'+endpointClass.getSourceFile().getFilePath()+'" with the @Hidden decorator.');
                                        }

                                        let description = '';
                                        let valueDeclaration = prop.compilerSymbol.valueDeclaration as any;
                                        if (valueDeclaration.jsDoc && valueDeclaration.jsDoc[0] && valueDeclaration.jsDoc[0].comment)
                                        {
                                            description = valueDeclaration.jsDoc[0].comment;
                                        }

                                        return <IParameter>
                                        {
                                            name: prop.getName(),
                                            in: 'formData',
                                            type: 'file' as any,
                                            description: description,
                                            required: !(prop.compilerSymbol.getDeclarations() as any).some(_ => _.questionToken)
                                        };
                                    }));
                                }
                                else
                                {
                                    parameters = param.getType().getProperties().map(prop =>
                                    {
                                        let type = prop.getTypeAtLocation(param).getText().toLowerCase();
                                        if (type.includes('array') || type.includes('[]')) type = 'array';

                                        let description = '';
                                        let valueDeclaration = prop.compilerSymbol.valueDeclaration as any;
                                        if (valueDeclaration.jsDoc && valueDeclaration.jsDoc[0] && valueDeclaration.jsDoc[0].comment)
                                        {
                                            description = valueDeclaration.jsDoc[0].comment;
                                        }

                                        let p = <IParameter>{
                                            name: prop.getName(),
                                            in: 'formData',
                                            type: type as 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'file',
                                            description: description,
                                            required: !(prop.compilerSymbol.getDeclarations() as any).some(_ => _.questionToken)
                                        };

                                        if (type === 'array')
                                        {
                                            p.items =
                                            {
                                                type: prop.getTypeAtLocation(param).getText().toLowerCase().replace('array', '').replace('[]', '').replace('<', '').replace('>', '') as any
                                            };
                                        }

                                        return p;
                                    });
                                }
                            }
                            else
                            {
                                let buildSchema = (type: Type<ts.Type>): ISchema =>
                                {
                                    let required = [];

                                    let schema: ISchema =
                                    {
                                        type: 'object'
                                    };

                                    let schemaProps: { [name: string]: ISchema } = {};

                                    type.getProperties().forEach(prop =>
                                    {
                                        if (!(prop.compilerSymbol.getDeclarations() as any).some(_ => _.questionToken))
                                        {
                                            required.push(prop.getName());
                                        }

                                        let type = prop.getTypeAtLocation(param).getText().toLowerCase();
                                        if (type.includes('array') || type.includes('[]')) type = 'array';

                                        let description = '';
                                        let valueDeclaration = prop.compilerSymbol.valueDeclaration as any;
                                        if (valueDeclaration.jsDoc && valueDeclaration.jsDoc[0] && valueDeclaration.jsDoc[0].comment)
                                        {
                                            description = valueDeclaration.jsDoc[0].comment;
                                        }

                                        if
                                        (
                                            prop.getTypeAtLocation(param).isInterfaceType() ||
                                            prop.getTypeAtLocation(param).isAnonymousType() ||
                                            (
                                                prop.getTypeAtLocation(param).getTypeArguments()[0] &&
                                                (
                                                    prop.getTypeAtLocation(param).getTypeArguments()[0].isAnonymousType() ||
                                                    prop.getTypeAtLocation(param).getTypeArguments()[0].isInterfaceType()
                                                )
                                            )
                                        ){
                                            schemaProps[prop.getName()] =
                                            {
                                                type: type === 'array' ? 'array' : 'object',
                                                description: description
                                            };

                                            if (type === 'array')
                                            {
                                                if (prop.getTypeAtLocation(param).getTypeArguments()[0])
                                                {
                                                    schemaProps[prop.getName()].items = buildSchema(prop.getTypeAtLocation(param).getTypeArguments()[0]);
                                                }
                                                else
                                                {
                                                    schemaProps[prop.getName()].items = buildSchema(prop.getTypeAtLocation(param));
                                                }
                                            }
                                            else
                                            {
                                                schemaProps[prop.getName()].properties = buildSchema(prop.getTypeAtLocation(param)).properties;
                                            }
                                        }
                                        else
                                        {
                                            schemaProps[prop.getName()] =
                                            {
                                                type: type as 'array' | 'boolean' | 'integer' | 'number' | 'null' | 'object' | 'string' | 'file',
                                                description: description
                                            };

                                            if (type === 'array')
                                            {
                                                schemaProps[prop.getName()].items =
                                                {
                                                    type: prop.getTypeAtLocation(param).getText().toLowerCase().replace('array', '').replace('[]', '').replace('<', '').replace('>', '') as any
                                                };
                                            }
                                        }
                                    });

                                    if (required.length > 0) schema.required = required;
                                    schema.properties = schemaProps;

                                    return schema;
                                };

                                parameters.push
                                ({
                                    name: param.getName(),
                                    in: location,
                                    schema: buildSchema(param.getType())
                                });
                            }
                        }
                        else
                        {
                            let name = param.getName();
                            if (formDecoratorArgs[0] && formDecoratorArgs[0].getText() !== 'null' && formDecoratorArgs[0].getText() !== 'undefined')
                            {
                                name = trim(formDecoratorArgs[0].getText(), '"\'');
                            }

                            let description = '';
                            if (formDecoratorArgs[1] && formDecoratorArgs[1].getText() !== 'null' && formDecoratorArgs[1].getText() !== 'undefined')
                            {
                                description = trim(formDecoratorArgs[1].getText(), '"\'');
                            }

                            let required = false;
                            if (location === 'path')
                            {
                                required = true;
                            }
                            else if (formDecoratorArgs[2])
                            {
                                required = formDecoratorArgs[2].getText() === 'true';
                            }

                            let type = param.getType().getText().toLowerCase();
                            if (type.includes('array') || type.includes('[]')) type = 'array';

                            // query, header, path parameters
                            parameters.push
                            ({
                                name: name,
                                in: location,
                                type: type as 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'file',
                                required: required,
                                description: description
                            });
                        }

                        return parameters;
                    })
                    .reduce((curr, prev) => curr.concat(prev)),
                    responses: responses
                });
            }

            executeMethodDecorators.forEach(d => d.remove());

            return endpoints;
        })
        .reduce((curr, prev) => curr.concat(prev))
    });

    shell.mkdir('-p', __dirname + '/../dist/app');

    await fs.writeFile(__dirname + '/../dist/app/swagger.json', await spec.toJson());
};

export default GenerateSwaggerDoc;
