import{b as H,c as $,i as s}from"./chunk-QYEQI4EQ.js";import{na as q,oa as u,ua as G}from"./chunk-2KYWLR7J.js";import{$c as V,Fb as g,Gb as S,Gc as P,Hb as E,Ib as A,Ka as i,Kb as v,Lb as T,M as b,N as h,P as C,R as l,Sb as c,Tb as F,Tc as Q,Ub as j,Vc as O,Xc as R,Ya as I,Za as k,ab as x,bb as B,cb as r,gc as z,ib as M,la as m,rb as a,sb as f,tb as y,ub as w,yb as D,zb as N}from"./chunk-PG6J5NCR.js";var J=`
    .p-tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: dt('tag.primary.background');
        color: dt('tag.primary.color');
        font-size: dt('tag.font.size');
        font-weight: dt('tag.font.weight');
        padding: dt('tag.padding');
        border-radius: dt('tag.border.radius');
        gap: dt('tag.gap');
    }

    .p-tag-icon {
        font-size: dt('tag.icon.size');
        width: dt('tag.icon.size');
        height: dt('tag.icon.size');
    }

    .p-tag-rounded {
        border-radius: dt('tag.rounded.border.radius');
    }

    .p-tag-success {
        background: dt('tag.success.background');
        color: dt('tag.success.color');
    }

    .p-tag-info {
        background: dt('tag.info.background');
        color: dt('tag.info.color');
    }

    .p-tag-warn {
        background: dt('tag.warn.background');
        color: dt('tag.warn.color');
    }

    .p-tag-danger {
        background: dt('tag.danger.background');
        color: dt('tag.danger.color');
    }

    .p-tag-secondary {
        background: dt('tag.secondary.background');
        color: dt('tag.secondary.color');
    }

    .p-tag-contrast {
        background: dt('tag.contrast.background');
        color: dt('tag.contrast.color');
    }
`;var U=["icon"],W=["*"];function X(t,d){if(t&1&&w(0,"span",4),t&2){let e=g(2);c(e.cx("icon")),a("ngClass",e.icon)("pBind",e.ptm("icon"))}}function Y(t,d){if(t&1&&(D(0),r(1,X,1,4,"span",3),N()),t&2){let e=g();i(),a("ngIf",e.icon)}}function Z(t,d){}function tt(t,d){t&1&&r(0,Z,0,0,"ng-template")}function et(t,d){if(t&1&&(f(0,"span",2),r(1,tt,1,0,null,5),y()),t&2){let e=g();c(e.cx("icon")),a("pBind",e.ptm("icon")),i(),a("ngTemplateOutlet",e.iconTemplate||e._iconTemplate)}}var nt={root:({instance:t})=>["p-tag p-component",{"p-tag-info":t.severity==="info","p-tag-success":t.severity==="success","p-tag-warn":t.severity==="warn","p-tag-danger":t.severity==="danger","p-tag-secondary":t.severity==="secondary","p-tag-contrast":t.severity==="contrast","p-tag-rounded":t.rounded}],icon:"p-tag-icon",label:"p-tag-label"},K=(()=>{class t extends G{name="tag";style=J;classes=nt;static \u0275fac=(()=>{let e;return function(n){return(e||(e=m(t)))(n||t)}})();static \u0275prov=b({token:t,factory:t.\u0275fac})}return t})();var L=new C("TAG_INSTANCE"),ot=(()=>{class t extends ${componentName="Tag";$pcTag=l(L,{optional:!0,skipSelf:!0})??void 0;bindDirectiveInstance=l(s,{self:!0});onAfterViewChecked(){this.bindDirectiveInstance.setAttrs(this.ptms(["host","root"]))}styleClass;severity;value;icon;rounded;iconTemplate;templates;_iconTemplate;_componentStyle=l(K);onAfterContentInit(){this.templates?.forEach(e=>{e.getType()==="icon"&&(this._iconTemplate=e.template)})}get dataP(){return this.cn({rounded:this.rounded,[this.severity]:this.severity})}static \u0275fac=(()=>{let e;return function(n){return(e||(e=m(t)))(n||t)}})();static \u0275cmp=I({type:t,selectors:[["p-tag"]],contentQueries:function(o,n,_){if(o&1&&A(_,U,4)(_,q,4),o&2){let p;v(p=T())&&(n.iconTemplate=p.first),v(p=T())&&(n.templates=p)}},hostVars:3,hostBindings:function(o,n){o&2&&(M("data-p",n.dataP),c(n.cn(n.cx("root"),n.styleClass)))},inputs:{styleClass:"styleClass",severity:"severity",value:"value",icon:"icon",rounded:[2,"rounded","rounded",P]},features:[z([K,{provide:L,useExisting:t},{provide:H,useExisting:t}]),x([s]),B],ngContentSelectors:W,decls:5,vars:6,consts:[[4,"ngIf"],[3,"class","pBind",4,"ngIf"],[3,"pBind"],[3,"class","ngClass","pBind",4,"ngIf"],[3,"ngClass","pBind"],[4,"ngTemplateOutlet"]],template:function(o,n){o&1&&(S(),E(0),r(1,Y,2,1,"ng-container",0)(2,et,2,4,"span",1),f(3,"span",2),F(4),y()),o&2&&(i(),a("ngIf",!n.iconTemplate&&!n._iconTemplate),i(),a("ngIf",n.iconTemplate||n._iconTemplate),i(),c(n.cx("label")),a("pBind",n.ptm("label")),i(),j(n.value))},dependencies:[V,Q,O,R,u,s],encapsulation:2,changeDetection:0})}return t})(),It=(()=>{class t{static \u0275fac=function(o){return new(o||t)};static \u0275mod=k({type:t});static \u0275inj=h({imports:[ot,u,u]})}return t})();export{ot as a,It as b};
