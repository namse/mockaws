1. bun 을 이용하여 s3 get, put object command 그리고 presigned url에 대한 처리를 지원하는 http server를 만들어줘.\
2. 역시 bun으로 동작하는 테스트 클라이언트를 만들어서 aws sdk를 이용해서 get, put object command 와 presigned url 에 대한 요청을 하도록 만들어줘.\
3. 이 두개를 docker compose로 만들어서, 테스트가 정상적으로 동작하는지 만들어줘.

presigned url 구현 - https://www.npmjs.com/package/@smithy/signature-v4

package.json 은 직접 수정하지 말고 bun i 를 이용하여 최신의 패키지를 설치할 것.

최신 패키지의 사용법에 대해서는 검색 및 정보를 얻어서 사용할 것.
