import { Get, Response } from 'app/Decorators';
import { BaseEndpoint } from 'app/Endpoints/BaseEndpoint';
import { IEndpoint, I400InvalidResponse } from 'app/Types';

export default class Foo extends BaseEndpoint implements IEndpoint
{
    @Get()
    @Response<IFooResponse>(200)
    @Response(500, 'Internal Server Error')
    @Response<I400InvalidResponse>(400, 'Invalid Request')
    public async Execute()
    {
        return { foo: 'bar' };
    }
}

export interface IFooResponse
{
    foo: string;
}
