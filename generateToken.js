
// token
// bookings
// extract data from attachment/url
// update bookings 
    // update Pos
    // style number 
    // cbm 
// automate


import { GraphQLClient, gql } from 'graphql-request'

const LOGIN = gql`
  mutation {
    login(
      authProfileUuid: "17838b935c5a46eebc885bae212d6d86"
      username: "agents"
      password: "admin@123"
    ) {
      jwtToken
      refreshToken
    }
  }
`;
export class GenerateToken {
    constructor(endpoint){
        this.client = new GraphQLClient(endpoint)
    }
    async login() {
        const { login } = await this.client.request(LOGIN);
        return login;
    }
}

// export {GenerateToken};