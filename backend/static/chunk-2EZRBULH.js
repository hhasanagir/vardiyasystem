import{b as K,c as L,i as h,j as v}from"./chunk-QYEQI4EQ.js";import{V,la as $,ma as z,na as G,oa as b,ua as J}from"./chunk-2KYWLR7J.js";import{$c as P,Ab as y,Fb as _,Gb as R,Hb as g,Ib as q,Ka as r,Kb as c,Lb as d,M as I,N as F,P as S,R as T,Rb as w,Sb as m,Tb as x,Ub as B,Vc as O,Xc as H,Ya as k,Za as N,ab as j,bb as Q,cb as p,gc as A,ha as D,la as C,rb as i,sb as f,tb as u,yb as E,zb as M}from"./chunk-PG6J5NCR.js";var U=`
    .p-card {
        background: dt('card.background');
        color: dt('card.color');
        box-shadow: dt('card.shadow');
        border-radius: dt('card.border.radius');
        display: flex;
        flex-direction: column;
    }

    .p-card-caption {
        display: flex;
        flex-direction: column;
        gap: dt('card.caption.gap');
    }

    .p-card-body {
        padding: dt('card.body.padding');
        display: flex;
        flex-direction: column;
        gap: dt('card.body.gap');
    }

    .p-card-title {
        font-size: dt('card.title.font.size');
        font-weight: dt('card.title.font.weight');
    }

    .p-card-subtitle {
        color: dt('card.subtitle.color');
    }
`;var Y=["header"],Z=["title"],ee=["subtitle"],te=["content"],ne=["footer"],ie=["*",[["p-header"]],[["p-footer"]]],ae=["*","p-header","p-footer"];function re(t,l){t&1&&y(0)}function oe(t,l){if(t&1&&(f(0,"div",1),g(1,1),p(2,re,1,0,"ng-container",2),u()),t&2){let e=_();m(e.cx("header")),i("pBind",e.ptm("header")),r(2),i("ngTemplateOutlet",e.headerTemplate||e._headerTemplate)}}function le(t,l){if(t&1&&(E(0),x(1),M()),t&2){let e=_(2);r(),B(e.header)}}function pe(t,l){t&1&&y(0)}function ce(t,l){if(t&1&&(f(0,"div",1),p(1,le,2,1,"ng-container",3)(2,pe,1,0,"ng-container",2),u()),t&2){let e=_();m(e.cx("title")),i("pBind",e.ptm("title")),r(),i("ngIf",e.header&&!e._titleTemplate&&!e.titleTemplate),r(),i("ngTemplateOutlet",e.titleTemplate||e._titleTemplate)}}function de(t,l){if(t&1&&(E(0),x(1),M()),t&2){let e=_(2);r(),B(e.subheader)}}function se(t,l){t&1&&y(0)}function me(t,l){if(t&1&&(f(0,"div",1),p(1,de,2,1,"ng-container",3)(2,se,1,0,"ng-container",2),u()),t&2){let e=_();m(e.cx("subtitle")),i("pBind",e.ptm("subtitle")),r(),i("ngIf",e.subheader&&!e._subtitleTemplate&&!e.subtitleTemplate),r(),i("ngTemplateOutlet",e.subtitleTemplate||e._subtitleTemplate)}}function fe(t,l){t&1&&y(0)}function ue(t,l){t&1&&y(0)}function _e(t,l){if(t&1&&(f(0,"div",1),g(1,2),p(2,ue,1,0,"ng-container",2),u()),t&2){let e=_();m(e.cx("footer")),i("pBind",e.ptm("footer")),r(2),i("ngTemplateOutlet",e.footerTemplate||e._footerTemplate)}}var ye=`
    ${U}

    .p-card {
        display: block;
    }
`,he={root:"p-card p-component",header:"p-card-header",body:"p-card-body",caption:"p-card-caption",title:"p-card-title",subtitle:"p-card-subtitle",content:"p-card-content",footer:"p-card-footer"},W=(()=>{class t extends J{name="card";style=ye;classes=he;static \u0275fac=(()=>{let e;return function(n){return(e||(e=C(t)))(n||t)}})();static \u0275prov=I({token:t,factory:t.\u0275fac})}return t})();var X=new S("CARD_INSTANCE"),Te=(()=>{class t extends L{componentName="Card";$pcCard=T(X,{optional:!0,skipSelf:!0})??void 0;bindDirectiveInstance=T(h,{self:!0});_componentStyle=T(W);onAfterViewChecked(){this.bindDirectiveInstance.setAttrs(this.ptms(["host","root"]))}header;subheader;set style(e){V(this._style(),e)||(this._style.set(e),this.el?.nativeElement&&e&&Object.keys(e).forEach(o=>{this.el.nativeElement.style[o]=e[o]}))}get style(){return this._style()}styleClass;headerFacet;footerFacet;headerTemplate;titleTemplate;subtitleTemplate;contentTemplate;footerTemplate;_headerTemplate;_titleTemplate;_subtitleTemplate;_contentTemplate;_footerTemplate;_style=D(null);getBlockableElement(){return this.el.nativeElement}templates;onAfterContentInit(){this.templates.forEach(e=>{switch(e.getType()){case"header":this._headerTemplate=e.template;break;case"title":this._titleTemplate=e.template;break;case"subtitle":this._subtitleTemplate=e.template;break;case"content":this._contentTemplate=e.template;break;case"footer":this._footerTemplate=e.template;break;default:this._contentTemplate=e.template;break}})}static \u0275fac=(()=>{let e;return function(n){return(e||(e=C(t)))(n||t)}})();static \u0275cmp=k({type:t,selectors:[["p-card"]],contentQueries:function(o,n,s){if(o&1&&q(s,$,5)(s,z,5)(s,Y,4)(s,Z,4)(s,ee,4)(s,te,4)(s,ne,4)(s,G,4),o&2){let a;c(a=d())&&(n.headerFacet=a.first),c(a=d())&&(n.footerFacet=a.first),c(a=d())&&(n.headerTemplate=a.first),c(a=d())&&(n.titleTemplate=a.first),c(a=d())&&(n.subtitleTemplate=a.first),c(a=d())&&(n.contentTemplate=a.first),c(a=d())&&(n.footerTemplate=a.first),c(a=d())&&(n.templates=a)}},hostVars:4,hostBindings:function(o,n){o&2&&(w(n._style()),m(n.cn(n.cx("root"),n.styleClass)))},inputs:{header:"header",subheader:"subheader",style:"style",styleClass:"styleClass"},features:[A([W,{provide:X,useExisting:t},{provide:K,useExisting:t}]),j([h]),Q],ngContentSelectors:ae,decls:8,vars:11,consts:[[3,"pBind","class",4,"ngIf"],[3,"pBind"],[4,"ngTemplateOutlet"],[4,"ngIf"]],template:function(o,n){o&1&&(R(ie),p(0,oe,3,4,"div",0),f(1,"div",1),p(2,ce,3,5,"div",0)(3,me,3,5,"div",0),f(4,"div",1),g(5),p(6,fe,1,0,"ng-container",2),u(),p(7,_e,3,4,"div",0),u()),o&2&&(i("ngIf",n.headerFacet||n.headerTemplate||n._headerTemplate),r(),m(n.cx("body")),i("pBind",n.ptm("body")),r(),i("ngIf",n.header||n.titleTemplate||n._titleTemplate),r(),i("ngIf",n.subheader||n.subtitleTemplate||n._subtitleTemplate),r(),m(n.cx("content")),i("pBind",n.ptm("content")),r(2),i("ngTemplateOutlet",n.contentTemplate||n._contentTemplate),r(),i("ngIf",n.footerFacet||n.footerTemplate||n._footerTemplate))},dependencies:[P,O,H,b,v,h],encapsulation:2,changeDetection:0})}return t})(),Oe=(()=>{class t{static \u0275fac=function(o){return new(o||t)};static \u0275mod=N({type:t});static \u0275inj=F({imports:[Te,b,v,b,v]})}return t})();export{Te as a,Oe as b};
