const soap = require('soap');
const http = require('http');

// WSDL (SOAP definition)
const wsdl = `
<definitions name="CMSService"
             targetNamespace="http://example.com/cms"
             xmlns:tns="http://example.com/cms"
             xmlns:xsd="http://www.w3.org/2001/XMLSchema"
             xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
             xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/">
  
  <message name="CreateOrderRequest">
    <part name="orderId" type="xsd:string"/>
    <part name="client" type="xsd:string"/>
  </message>
  
  <message name="CreateOrderResponse">
    <part name="status" type="xsd:string"/>
  </message>
  
  <portType name="CMSPortType">
    <operation name="CreateOrder">
      <input message="tns:CreateOrderRequest"/>
      <output message="tns:CreateOrderResponse"/>
    </operation>
  </portType>
  
  <binding name="CMSBinding" type="tns:CMSPortType">
    <soap:binding style="rpc"
                  transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="CreateOrder">
      <soap:operation soapAction="createOrder"/>
      <input>
        <soap:body use="literal" namespace="http://example.com/cms"/>
      </input>
      <output>
        <soap:body use="literal" namespace="http://example.com/cms"/>
      </output>
    </operation>
  </binding>
  
  <service name="CMSService">
    <port name="CMSPort" binding="tns:CMSBinding">
      <soap:address location="http://localhost:5000/cms"/>
    </port>
  </service>
</definitions>
`;

// Service Implementation
const service = {
  CMSService: {
    CMSPort: {
      CreateOrder(args) {
        console.log("CMS received order:", args);
        return { status: `Order ${args.orderId} created for client ${args.client}` };
      }
    }
  }
};

const server = http.createServer((req, res) => res.end("404: Not Found"));
server.listen(5000, () => {
  soap.listen(server, '/cms', service, wsdl);
  console.log("CMS SOAP service running on http://localhost:5000/cms?wsdl");
});
